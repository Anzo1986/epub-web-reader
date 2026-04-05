// V21: Global Element Hook - Catch the iframe before it's even added to the DOM
const originalCreateElement = document.createElement;
document.createElement = function(tagName, options) {
    const el = originalCreateElement.call(document, tagName, options);
    if (tagName.toLowerCase() === 'iframe') {
        el.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups allow-forms');
        console.log('[System] Intercepted iframe creation - forcing sandbox');
    }
    return el;
};

let book = null;
let rendition = null;

const uploadInput = document.getElementById('book-upload');
const viewer = document.getElementById('viewer');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const pageInfo = document.getElementById('page-info');
const translateTrigger = document.getElementById('translate-trigger');
const ttsTrigger = document.getElementById('tts-trigger');
const ttsSpeed = document.getElementById('tts-speed');

let touchStartX = 0;
let touchEndX = 0;
let synth = window.speechSynthesis;
let uiTimer = null;
let currentLanguage = 'en';

// V21 Navigation Lock: Double-guaranteed
let navInProgress = false;
let navCooldown = false;

function navigate(direction) {
    if (!rendition || navInProgress || navCooldown) return;
    
    navInProgress = true; 
    navCooldown = true;
    
    if (direction === 'next') rendition.next();
    else rendition.prev();
    
    showUI();
    
    // Safety timer: unlock even if relocated fails
    setTimeout(() => { navCooldown = false; }, 500); 
}

console.log("App Version: v21.0 (Deep System Interception)");

// Global Key Listeners
window.addEventListener('keydown', (e) => {
    if (e.key === "ArrowLeft") navigate('prev');
    if (e.key === "ArrowRight") navigate('next');
});

function hideUI() {
    document.body.classList.add('hidden-ui');
}

function showUI() {
    document.body.classList.remove('hidden-ui');
    resetUITimer();
}

function resetUITimer() {
    if (uiTimer) clearTimeout(uiTimer);
    uiTimer = setTimeout(hideUI, 3500); 
}

async function toggleLanguage() {
    const btn = document.getElementById('translate-trigger');
    const getCombo = () => document.querySelector('.goog-te-combo');
    let combo = getCombo();
    if (!combo) {
        if (btn) btn.innerText = "⏳ Lädt...";
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 500));
            combo = getCombo();
            if (combo) break;
        }
    }
    if (!combo) {
        alert("Google Translate ist noch nicht bereit.");
        if (btn) btn.innerText = "🌍 Auf Deutsch";
        return;
    }
    if (currentLanguage === 'en') {
        combo.value = 'de';
        currentLanguage = 'de';
        if (btn) btn.innerText = "🇺🇸 Original";
    } else {
        combo.value = '';
        currentLanguage = 'en';
        if (btn) btn.innerText = "🌍 Auf Deutsch";
    }
    combo.dispatchEvent(new Event('change'));
    resetUITimer();
}

// Book Loading Logic
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const storedBook = await localforage.getItem('stored-epub-book');
        const storedName = await localforage.getItem('stored-epub-name');
        if (storedBook && storedName) {
            console.log('Found stored book. Loading...');
            openBook(storedBook, storedName);
        }
    } catch (err) {
        console.error('Error loading stored book:', err);
    }
});

uploadInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        const arrayBuffer = e.target.result;
        try {
            await localforage.setItem('stored-epub-book', arrayBuffer);
            await localforage.setItem('stored-epub-name', file.name);
        } catch (err) { console.error('Error saving book:', err); }
        openBook(arrayBuffer, file.name);
    };
    reader.readAsArrayBuffer(file);
});

function openBook(bookData, filename) {
    if (book) {
        try { book.destroy(); } catch(e) {}
    }
    viewer.innerHTML = '';
    
    book = ePub(bookData);
    rendition = book.renderTo("viewer", {
        width: "100%",
        height: "100%",
        flow: "paginated",
        manager: "default"
    });

    rendition.on("rendered", (section, view) => {
        const win = view.iframe ? view.iframe.contentWindow : window;
        const doc = view.document || (view.iframe && view.iframe.contentDocument);
        if (!doc) return; 

        // Keyboard Event Propagation
        doc.addEventListener('keydown', (e) => {
            window.dispatchEvent(new KeyboardEvent('keydown', {
                key: e.key, code: e.code, keyCode: e.keyCode, which: e.which,
                shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey
            }));
        });

        doc.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            resetUITimer();
        }, {passive: true});

        doc.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchEndX - touchStartX;
            if (diff < -65) navigate('next');
            else if (diff > 65) navigate('prev');
        });

        doc.addEventListener('click', (e) => {
            const x = e.clientX;
            const y = e.clientY;
            const w = win.innerWidth;
            const h = win.innerHeight;
            if (x > w * 0.25 && x < w * 0.75 && y > h * 0.25 && y < h * 0.75) {
                if (document.body.classList.contains('hidden-ui')) showUI(); else hideUI();
            } else { resetUITimer(); }
        });
    });

    // Image Repair v7: Aggressive cleaning + SW protection
    rendition.hooks.content.register((contents) => {
        const doc = contents.document;
        if (!doc) return;
        const repair = () => {
            doc.querySelectorAll('img').forEach(img => {
                const src = img.getAttribute('src');
                if (src && src.includes('blob:')) {
                    const blobMatch = src.match(/blob:https?:\/\/[^\s"']+/);
                    if (blobMatch && src !== blobMatch[0]) {
                        img.removeAttribute('src'); 
                        img.src = blobMatch[0];
                    }
                }
            });
        };
        repair();
        setTimeout(repair, 100);
        setTimeout(repair, 500);
    });

    rendition.themes.register("dark", {
        "body": { "background": "#0f172a", "color": "#f8fafc" }
    });
    rendition.themes.select("dark");

    book.ready.then(() => {
        const savedLocation = localStorage.getItem(`epub-location-${filename}`);
        if (savedLocation) rendition.display(savedLocation);
        else rendition.display();
        book.locations.generate(1024).then(() => updatePageInfo());
    });

    rendition.on("relocated", (location) => {
        localStorage.setItem(`epub-location-${filename}`, location.start.cfi);
        updatePageInfo();
        if (synth && synth.speaking) synth.cancel(); 
        navInProgress = false; 
    });

    rendition.on("click", (e) => showUI());
}

function updatePageInfo() {
    if(!book || !rendition) return;
    try {
        const loc = rendition.currentLocation();
        if(loc && loc.start) {
            let percent = book.locations.percentageFromCfi(loc.start.cfi);
            pageInfo.innerText = Math.round(percent * 100) + "% gelesen";
        }
    } catch(e) {}
}

prevBtn.addEventListener('click', (e) => { e.stopPropagation(); navigate('prev'); });
nextBtn.addEventListener('click', (e) => { e.stopPropagation(); navigate('next'); });

document.body.addEventListener('click', (e) => {
    if (e.target === document.body || e.target === viewer) {
        if (document.body.classList.contains('hidden-ui')) showUI(); else hideUI();
    }
});

function toggleTTS() {
    window.speechSynthesis.cancel();
    const activeIframe = viewer.querySelector('iframe');
    const textToRead = activeIframe?.contentDocument?.body?.innerText;
    if (!textToRead) return;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    const isTranslated = !!(translateTrigger && translateTrigger.innerText.includes('Original'));
    utterance.lang = isTranslated ? 'de-DE' : 'en-US';
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith(utterance.lang.split('-')[0])) || voices[0];
    if (voice) utterance.voice = voice;
    if (ttsSpeed) utterance.rate = parseFloat(ttsSpeed.value) || 1.0;
    utterance.onstart = () => { synthStatus.isSpeaking = true; ttsTrigger.innerText = "⏹ Stopp"; ttsTrigger.style.backgroundColor = "#ef4444"; };
    utterance.onend = () => { synthStatus.isSpeaking = false; ttsTrigger.innerText = "🔊 Vorlesen"; ttsTrigger.style.backgroundColor = "var(--accent)"; };
    window.speechSynthesis.speak(utterance);
}

let synthStatus = { isSpeaking: false };
if (ttsTrigger) ttsTrigger.addEventListener('click', () => toggleTTS());

showUI();
