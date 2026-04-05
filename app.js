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

// V19 Navigation Lock: Absolute protection against page skipping
let navLock = false;
function navigate(direction) {
    if (!rendition || navLock) return;
    navLock = true;
    
    if (direction === 'next') rendition.next();
    else rendition.prev();
    
    showUI();
    // 300ms Cooldown: During this time, EVERY other navigation attempt is killed
    setTimeout(() => { navLock = false; }, 300);
}

console.log("App Version: v19.0 (Final Correction)");

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

// Sandbox Watchdog: Force permissions as soon as the iframe is injected
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.tagName === 'IFRAME') {
                node.setAttribute('sandbox', 'allow-same-origin allow-scripts');
            } else if (node.querySelectorAll) {
                const iframes = node.querySelectorAll('iframe');
                iframes.forEach(f => f.setAttribute('sandbox', 'allow-same-origin allow-scripts'));
            }
        }
    }
});
observer.observe(viewer, { childList: true, subtree: true });

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

    // V19 Multi-Step Navigation & Protection Hook
    rendition.on("rendered", (section, view) => {
        // Robust document discovery
        const doc = view.document || (view.iframe && view.iframe.contentDocument);
        if (!doc) return; 

        // Protection against double-binding
        if (doc.dataset && doc.dataset.v19Bound === "true") return;
        if (doc.dataset) doc.dataset.v19Bound = "true";

        doc.addEventListener('keyup', (e) => {
            if (e.key === "ArrowLeft") navigate('prev');
            if (e.key === "ArrowRight") navigate('next');
        });

        doc.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            resetUITimer();
        }, {passive: true});

        doc.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchEndX - touchStartX;
            if (diff < -60) navigate('next');
            else if (diff > 60) navigate('prev');
        });

        doc.addEventListener('click', (e) => {
            const x = e.clientX;
            const y = e.clientY;
            const win = view.iframe ? view.iframe.contentWindow : window;
            const w = win.innerWidth;
            const h = win.innerHeight;
            // Center tap
            if (x > w * 0.25 && x < w * 0.75 && y > h * 0.25 && y < h * 0.75) {
                if (document.body.classList.contains('hidden-ui')) showUI(); else hideUI();
            } else { 
                resetUITimer(); 
            }
        });
    });

    // Image Repair v5: Aggressive cleanup before and after render
    rendition.hooks.content.register((contents) => {
        const doc = contents.document;
        const fix = () => {
            if (!doc) return;
            const images = doc.querySelectorAll('img');
            images.forEach(img => {
                const src = img.getAttribute('src');
                const blobMatch = src ? src.match(/blob:https?:\/\/[^\s"']+/) : null;
                if (blobMatch && src !== blobMatch[0]) {
                    img.removeAttribute('src'); // Wipe bad prefix
                    img.src = blobMatch[0];      // Set clean blob
                }
            });
        };
        fix();
        setTimeout(fix, 150); 
        setTimeout(fix, 500); 
    });

    rendition.themes.register("dark", {
        "body": { "background": "#0f172a", "color": "#f8fafc" }
    });
    rendition.themes.select("dark");

    book.ready.then(() => {
        const savedLocation = localStorage.getItem(`epub-location-${filename}`);
        setTimeout(() => {
            if (savedLocation) rendition.display(savedLocation);
            else rendition.display();
        }, 150); 
        book.locations.generate(1024).then(() => updatePageInfo());
    });

    rendition.on("relocated", (location) => {
        localStorage.setItem(`epub-location-${filename}`, location.start.cfi);
        updatePageInfo();
        if (synth && synth.speaking) synth.cancel(); 
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
    if (synthStatus.isSpeaking) {
        synthStatus.isSpeaking = false;
        ttsTrigger.innerText = "🔊 Vorlesen";
        ttsTrigger.style.backgroundColor = "var(--accent)";
        return;
    }

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

    utterance.onstart = () => {
        synthStatus.isSpeaking = true;
        ttsTrigger.innerText = "⏹ Stopp";
        ttsTrigger.style.backgroundColor = "#ef4444";
    };
    utterance.onend = () => {
        synthStatus.isSpeaking = false;
        ttsTrigger.innerText = "🔊 Vorlesen";
        ttsTrigger.style.backgroundColor = "var(--accent)";
    };
    utterance.onerror = () => {
        synthStatus.isSpeaking = false;
        ttsTrigger.innerText = "🔊 Vorlesen";
        ttsTrigger.style.backgroundColor = "var(--accent)";
    };
    window.speechSynthesis.speak(utterance);
}

let synthStatus = { isSpeaking: false };
if (ttsTrigger) ttsTrigger.addEventListener('click', () => toggleTTS());

showUI();
