// Basit durum makinesi: preloader -> intro (typewriter) -> cake
const preloader = document.getElementById('preloader');
const intro = document.getElementById('intro');
const typeEl = document.getElementById('typewriter');
const cakeScreen = document.getElementById('cake-screen');
const micHint = document.getElementById('mic-hint');
const micBtn = document.getElementById('mic-btn');
const debugEl = document.getElementById('debug');

// Kullanıcı ayarı: isim
const NAME = 'Aylin';
const MESSAGE = `Doğum Günün Kutlu olsun.\nİyiki Doğdun Arkadaşım 🧡`;

// Preloader kaldır
window.addEventListener('load', () => {
    setTimeout(() => preloader.classList.add('hide'), 500);
    // Typewriter başlat
    startTypewriter(MESSAGE, 55).then(() => {
        // 700ms bekle, sonra pasta ekranına geç
        setTimeout(() => switchToCake(), 700);
    });
});

function startTypewriter(text, speed = 60) {
    return new Promise(resolve => {
        let i = 0;
        typeEl.textContent = '';
        intro.classList.add('active');
        const interval = setInterval(() => {
            typeEl.textContent += text.charAt(i);
            i++;
            if (i >= text.length) {
                clearInterval(interval);
                resolve();
            }
        }, speed);
    });
}

function switchToCake() {
    intro.classList.remove('active');
    intro.setAttribute('aria-hidden', 'true');
    cakeScreen.classList.add('active');
    cakeScreen.removeAttribute('aria-hidden');
    // Kullanıcıya mikrofonu başlatması için butonu göster (iOS/izin/etkileşim gereksinimi için güvenli)
    micBtn.classList.remove('hidden');
    micHint.textContent = 'Mikrofonu başlatın, sonra üfleyin ✨';
    debugEl.classList.remove('hidden');
}

// Mumları yönet
const candles = Array.from(document.querySelectorAll('.candle'));
function extinguishCandles() {
    candles.forEach(c => {
        if (!c.classList.contains('out')) {
            c.classList.add('out');
            // puff animasyonu tetikle: smoke içindeki spanlara yeniden akış
            const spans = c.querySelectorAll('.smoke span');
            spans.forEach(s => {
                s.style.animation = 'none';
                // reflow
                void s.offsetWidth;
                s.style.animation = '';
            });
        }
    });
    micHint.textContent = 'Dileklerini tut 🎁';
    
    // Kutlama gösterisini başlat
    startCelebration();
    
    const wish = document.getElementById('wish');
    if(wish){
        wish.classList.remove('hidden');
        // Küçük gecikmeyle fade-in daha zarif görünür
        requestAnimationFrame(() => requestAnimationFrame(() => wish.classList.add('show')));
    }
}

// Kutlama gösterisi
function startCelebration() {
    const celebration = document.getElementById('celebration');
    if (celebration) {
        celebration.classList.remove('hidden');
        
            // 8 saniye sonra kutlama gösterisini gizle
        setTimeout(() => {
            celebration.classList.add('hidden');
            }, 8000);
    }
}

// Mikrofonla üfleme algılama
let audioStream;
let audioContext;
let analyser;
let timeData;
let freqData;
let isBlown = false;
let baseNoise = 0; // dinamik kalibrasyon
let calibrated = false;

async function initMic() {
    // Güvenli bağlam ve API desteği kontrolü
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('getUserMedia desteklenmiyor veya güvenli bağlam değil.');
    micHint.textContent = 'Mikrofon desteklenmiyor. Tarayıcı ayarlarından izin verin.';
        return;
    }
    try {
        // Not: getUserMedia mikrofon için HTTPS veya localhost gerektirir
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(audioStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        timeData = new Uint8Array(analyser.fftSize);
        freqData = new Uint8Array(analyser.frequencyBinCount);
        // Önce 500ms ortam gürültüsünü kalibre et
        await calibrateNoise(600);
        // Timer'ı sıfırla ve başlat
        micStartTime = performance.now();
        hasShownInitialWarning = false;
        listenForBlow();
        micHint.textContent = 'Hazır! Mikrofona üfleyin ✨';
    } catch (err) {
        console.warn('Mikrofon erişimi alınamadı:', err);
    micHint.textContent = 'Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verin.';
    }
}

function getRMS() {
    analyser.getByteTimeDomainData(timeData);
    let sum = 0;
    // Diferansiyel RMS: DC ve yavaş değişimleri azaltır (üflemenin keskin komponentleri öne çıkar)
    let prev = (timeData[0] - 128) / 128;
    for (let i = 1; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128; // -1..1
        const d = v - prev;
        sum += d * d;
        prev = v;
    }
    return Math.sqrt(sum / (timeData.length - 1)) * 140; // skala artırıldı
}

function calibrateNoise(durationMs = 500) {
    calibrated = false;
    return new Promise(resolve => {
        const start = performance.now();
        let acc = 0; let n = 0; let peak = 0;
        const step = () => {
            const rms = getRMS();
            acc += rms; n++; if (rms > peak) peak = rms;
            if (performance.now() - start < durationMs) {
                requestAnimationFrame(step);
            } else {
                baseNoise = Math.max(0.9, acc / Math.max(1, n)); // diferansiyel RMS için alt sınır (çok düşürüldü)
                // ortama göre esnek eşik
                calibrated = true;
                resolve();
            }
        };
        step();
    });
}

let BLOW_HOLD_MS = 50; // çok hızlı tepki (%70 düşürüldü)
let aboveSince = 0;
let lastWarn = 0;
let hasShownInitialWarning = false; // Bir kerelik uyarı flag'i
let micStartTime = 0; // Mikrofon başlama zamanı

function listenForBlow() {
    const blowWarning = document.getElementById('blow-warning');
    const now = performance.now();
    const rms = getRMS();
    // Gürültüye göre marj (%70 düşürüldü): sessizde 0.88, gürültüde 1.56'e kadar
    const margin = Math.max(0.88, Math.min(1.56, 0.68 + (baseNoise / 80)));
    const dynamicThreshold = Math.min(19.5, baseNoise + margin);

    // Ek: üflemede yüksek frekans içeriği artar; 2kHz-6kHz bandına basit bir bakış
    analyser.getByteFrequencyData(freqData);
    const len = freqData.length;
    const sampleRate = audioContext?.sampleRate || 44100; // gerçek sampleRate kullan
    const binHz = (sampleRate / 2) / len;
    const from = Math.floor(2000 / binHz);
    const to = Math.min(len - 1, Math.floor(6000 / binHz));
    let hfSum = 0; let hfN = 0;
    for (let i = from; i <= to; i++) { hfSum += freqData[i]; hfN++; }
    const hfAvg = hfN ? (hfSum / hfN) : 0; // 0..255

    // görsel olarak hafif kıs: çok yüksekte dim kaldır
    candles.forEach(c => c.classList.toggle('dim', rms < dynamicThreshold));

    // Gürültü seviyesine göre HF eşiği (%70 düşürüldü): çok kolay tetikleme için
    const hfThreshold = Math.max(4.87, Math.min(8.77, 6.82 + (baseNoise - 15) * 0.15));
    // RMS ve yüksek frekans birlikte sağlanmalı
    const blowDetected = (rms > dynamicThreshold) && (hfAvg > hfThreshold);
    debugEl.textContent = `RMS: ${rms.toFixed(1)} (Eşik: ${dynamicThreshold.toFixed(1)}) | HF: ${hfAvg.toFixed(0)} (Eşik: ${hfThreshold.toFixed(0)}) | Algılandı: ${blowDetected ? 'EVET' : 'HAYIR'}`;

    // Bir kerelik uyarı göster (mikrofon başladıktan 3 saniye sonra)
    if (!hasShownInitialWarning && blowWarning && !isBlown && (now - micStartTime) > 3000) {
        hasShownInitialWarning = true;
        blowWarning.classList.add('show');
        setTimeout(() => blowWarning.classList.remove('show'), 2000);
    }

    if (blowDetected) {
        if (blowWarning) blowWarning.classList.remove('show');
        if (aboveSince === 0) aboveSince = now;
        if (now - aboveSince > BLOW_HOLD_MS && !isBlown) {
            isBlown = true;
            extinguishCandles();
            stopMic();
            return;
        }
    } else {
        aboveSince = 0;
        // Yeterince güçlü üfleme yoksa uyarı göster - çok esnek koşul (%70 düşürüldü)
        if (blowWarning && !isBlown && (rms > (baseNoise + 0.195) || hfAvg > 2.92)) {
            // Biraz ses var ama yeterli değil - sadece her 1.2 saniyede bir göster
            if (now - lastWarn > 1200) {
                blowWarning.classList.add('show');
                lastWarn = now;
                setTimeout(() => blowWarning.classList.remove('show'), 1500);
            }
        }
    }

    requestAnimationFrame(listenForBlow);
}

function stopMic() {
    try {
        if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); }
        if (audioContext) { audioContext.close(); }
    } catch (e) { /* no-op */ }
}

// Klavye fallback kaldırıldı.

// Pasta ekranına geçildikten sonra mikrofonu hazırlamayı dene
// Otomatik başlatmayı kaldırdık; buton ile başlatılacak.

// Kullanıcı etkileşimi ile mikrofonu başlat (iOS/Safari politikası)
micBtn?.addEventListener('click', async () => {
    micBtn.disabled = true;
    micBtn.textContent = 'Başlatılıyor…';
    await initMic();
    micBtn.classList.add('hidden');
});


// Modern slider fonksiyonu
const sliderContainer = document.querySelector('.slider-container');
const sliderItems = document.querySelectorAll('.slider-item');
const sliderBtnPrev = document.querySelector('.slider-btn-prev');
const sliderBtnNext = document.querySelector('.slider-btn-next');
let sliderIndex = 0;

function updateSlider() {
    sliderItems.forEach((item, i) => {
        item.style.transform = `translateX(${-sliderIndex * 100}%)`;
    });
    if (sliderBtnPrev) sliderBtnPrev.style.display = sliderIndex === 0 ? 'none' : 'block';
    if (sliderBtnNext) sliderBtnNext.style.display = sliderIndex === sliderItems.length - 1 ? 'none' : 'block';
}

sliderBtnPrev?.addEventListener('click', () => {
    if (sliderIndex > 0) sliderIndex--;
    updateSlider();
});
sliderBtnNext?.addEventListener('click', () => {
    if (sliderIndex < sliderItems.length - 1) sliderIndex++;
    updateSlider();
});

// Slider ilk açılışta güncellensin
if (sliderContainer && sliderItems.length > 0) {
    updateSlider();
}

// Modern slideshow fonksiyonu
const slideshowTrack = document.querySelector('.slideshow-track');
const slides = document.querySelectorAll('.slide');
const slideshowBtnPrev = document.querySelector('.slideshow-btn-prev');
const slideshowBtnNext = document.querySelector('.slideshow-btn-next');
let slideIndex = 0;

function updateSlideshow() {
    slideshowTrack.style.transform = `translateX(${-slideIndex * 100}%)`;
    if (slideshowBtnPrev) slideshowBtnPrev.style.display = slideIndex === 0 ? 'none' : 'block';
    if (slideshowBtnNext) slideshowBtnNext.style.display = slideIndex === slides.length - 1 ? 'none' : 'block';
}

slideshowBtnPrev?.addEventListener('click', () => {
    if (slideIndex > 0) slideIndex--;
    updateSlideshow();
});
slideshowBtnNext?.addEventListener('click', () => {
    if (slideIndex < slides.length - 1) slideIndex++;
    updateSlideshow();
});

// Slideshow ilk açılışta güncellensin
if (slideshowTrack && slides.length > 0) {
    updateSlideshow();
}
