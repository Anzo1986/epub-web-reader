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

let touchStartX = 0, touchEndX = 0, synth = window.speechSynthesis, uiTimer = null, currentLanguage = 'en';

let navInProgress = false;
function navigate(direction) {
    if (!rendition || navInProgress) return;
    navInProgress = true;
    if (direction === 'next') rendition.next(); else rendition.prev();
    showUI();
    setTimeout(() => { navInProgress = false; }, 300);
}

console.log("App Version: v42.0 (Explicit Engine Fix)");

window.addEventListener('keydown', (e) => {
    if (e.key === "ArrowLeft") navigate('prev');
    if (e.key === "ArrowRight") navigate('next');
});

function hideUI() { document.body.classList.add('hidden-ui'); }
function showUI() { document.body.classList.remove('hidden-ui'); resetUITimer(); }
function resetUITimer() { if (uiTimer) clearTimeout(uiTimer); uiTimer = setTimeout(hideUI, 3500); }

async function toggleLanguage() {
    const btn = translateTrigger;
    const getCombo = () => document.querySelector('.goog-te-combo');
    let combo = getCombo();
    if (!combo) {
        if (btn) btn.innerText = "⏳ Lädt...";
        for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 500)); combo = getCombo(); if (combo) break; }
    }
    if (!combo) return;
    const isEng = currentLanguage === 'en';
    combo.value = isEng ? 'de' : '';
    currentLanguage = isEng ? 'de' : 'en';
    if (btn) btn.innerText = isEng ? "🇺🇸 Original" : "🌍 Auf Deutsch";
    combo.dispatchEvent(new Event('change'));
    resetUITimer();
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const storedBook = await localforage.getItem('stored-epub-book');
        const storedName = await localforage.getItem('stored-epub-name');
        if (storedBook && storedName) openBook(storedBook, storedName);
    } catch (err) { console.error('Error loading stored book:', err); }
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
    if (book) { try { book.destroy(); } catch(e) {} }
    viewer.innerHTML = '';
    
    book = ePub(bookData, { allowScriptedContent: true });
    
    // V42: Explicit Engine Fix
    // 1. Explicit Pixels instead of "100%"
    // 2. manager: "default" to respect paginated layout logic
    // 3. Removed spread: none to allow auto-calculation
    rendition = book.renderTo("viewer", {
        width: window.innerWidth,
        height: window.innerHeight,
        manager: "default",
        flow: "paginated",
        allowScriptedContent: true
    });

    // V42 Layout Fix: Force inner paddings and margins to absolute zero
    // This stops the text from being cut off on the right by native EPUB padding
    rendition.hooks.content.register((contents) => {
        contents.addStylesheetRules({
            "html": { "padding": "0 !important", "margin": "0 !important" },
            "body": { 
                "padding": "0 !important", 
                "margin": "0 !important", 
                "box-sizing": "border-box !important" 
            }
        });
    });

    // Dark mode for the iframe content via themes (safe), NOT via hooks (dangerous)
    rendition.themes.register("dark", {
        "body": { "background": "transparent !important", "color": "#f8fafc" },
        "img": { "max-width": "100%", "height": "auto", "display": "block", "margin": "20px auto" },
        "p": { "margin-bottom": "1.5em", "line-height": "1.6" },
        "h1, h2, h3, h4": { "color": "#f8fafc" }
    });
    rendition.themes.select("dark");
    
    // Touch interactions strictly applied via the iframe doc
    rendition.on("rendered", (e, iframe) => {
        const doc = iframe.document.documentElement;
        let gestureLocked = false;
        
        doc.addEventListener('touchstart', (e) => { 
            touchStartX = e.changedTouches[0].screenX; 
            resetUITimer(); 
        }, {passive: true});

        doc.addEventListener('touchend', (e) => {
            if (gestureLocked) return;
            const diff = e.changedTouches[0].screenX - touchStartX;
            if (Math.abs(diff) > 60) {
                gestureLocked = true;
                if (diff < -60) navigate('next'); else if (diff > 60) navigate('prev');
                setTimeout(() => { gestureLocked = false; }, 500); 
            }
        });

        doc.addEventListener('click', (e) => {
            const x = e.clientX, w = iframe.innerWidth || window.innerWidth;
            if (x > w * 0.25 && x < w * 0.75) {
                if (document.body.classList.contains('hidden-ui')) showUI(); else hideUI();
            } else { 
                if (gestureLocked) return;
                gestureLocked = true;
                if (x > w * 0.75) navigate('next'); else if (x < w * 0.25) navigate('prev');
                setTimeout(() => { gestureLocked = false; }, 500);
            }
        });
    });

    book.ready.then(() => {
        const savedLocation = localStorage.getItem(`epub-location-${filename}`);
        rendition.display(savedLocation || undefined);
        book.locations.generate(1024).then(() => updatePageInfo());
    });

    rendition.on("relocated", (location) => {
        localStorage.setItem(`epub-location-${filename}`, location.start.cfi);
        updatePageInfo();
        if (synth && synth.speaking) synth.cancel(); 
    });
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

let synthStatus = { isSpeaking: false };
function toggleTTS() {
    window.speechSynthesis.cancel();
    if (synthStatus.isSpeaking) { synthStatus.isSpeaking = false; ttsTrigger.innerText = "🔊 Vorlesen"; return; }
    const activeIframe = viewer.querySelector('iframe');
    const textToRead = activeIframe?.contentDocument?.body?.innerText;
    if (!textToRead) return;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = translateTrigger?.innerText.includes('Original') ? 'de-DE' : 'en-US';
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) utterance.voice = voices.find(v => v.lang.startsWith(utterance.lang.split('-')[0])) || voices[0];
    if (ttsSpeed) utterance.rate = parseFloat(ttsSpeed.value);
    utterance.onstart = () => { synthStatus.isSpeaking = true; ttsTrigger.innerText = "⏹ Stopp"; ttsTrigger.style.backgroundColor = "#ef4444"; };
    utterance.onend = () => { synthStatus.isSpeaking = false; ttsTrigger.innerText = "🔊 Vorlesen"; ttsTrigger.style.backgroundColor = "var(--accent)"; };
    window.speechSynthesis.speak(utterance);
}
if (ttsTrigger) ttsTrigger.addEventListener('click', toggleTTS);
showUI();
