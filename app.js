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
let currentUtterance = null;
let uiTimer = null;
let currentLanguage = 'en';

console.log("App Version: v17.1 (Hotfix)");

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
    
    // Polling function to wait for Google Translate widget
    const getCombo = () => document.querySelector('.goog-te-combo');
    
    let combo = getCombo();
    if (!combo) {
        if (btn) btn.innerText = "⏳ Lädt...";
        // Wait up to 5 seconds
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 500));
            combo = getCombo();
            if (combo) break;
        }
    }

    if (!combo) {
        alert("Google Translate ist noch nicht bereit. Bitte kurz warten und erneut versuchen.");
        if (btn) btn.innerText = "🌍 Auf Deutsch";
        return;
    }

    if (currentLanguage === 'en') {
        combo.value = 'de';
        currentLanguage = 'de';
        if (btn) btn.innerText = "🇺🇸 Original";
    } else {
        combo.value = ''; // Original
        currentLanguage = 'en';
        if (btn) btn.innerText = "🌍 Auf Deutsch";
    }

    combo.dispatchEvent(new Event('change'));
    resetUITimer();
}

// Load stored book data if exists
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const storedBook = await localforage.getItem('stored-epub-book');
        const storedName = await localforage.getItem('stored-epub-name');
        if (storedBook && storedName) {
            console.log('Found stored book. Loading...');
            openBook(storedBook, storedName);
        } else {
            alert('Willkommen! Bitte lade eine EPUB-Datei.');
        }
    } catch (err) {
        console.error('Error loading stored book:', err);
    }
});

uploadInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (window.FileReader) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const arrayBuffer = e.target.result;
            // Save to localforage for next time
            try {
                await localforage.setItem('stored-epub-book', arrayBuffer);
                await localforage.setItem('stored-epub-name', file.name);
            } catch (err) {
                console.error('Error saving book:', err);
            }
            openBook(arrayBuffer, file.name);
        };
        reader.readAsArrayBuffer(file);
    }
});

function openBook(bookData, filename) {
    // Clean up previous book
    if (book) {
        book.destroy();
    }
    viewer.innerHTML = '';

    // Render
    rendition = book.renderTo("viewer", {
        width: "100%",
        height: "100%",
        flow: "paginated",
        manager: "default",
        sandbox: "allow-same-origin allow-scripts"
    });

    // Clean navigation: using epub.js built-in managers while avoiding listener stacking
    rendition.on("rendered", (section, view) => {
        const doc = view.document;
        
        // Remove existing listeners if this is a re-render to avoid "skipping pages"
        const cleanNavigation = (e) => {
            if (e.key === "ArrowLeft") { rendition.prev(); showUI(); }
            if (e.key === "ArrowRight") { rendition.next(); showUI(); }
        };

        const handleSwipeStart = (e) => { touchStartX = e.changedTouches[0].screenX; };
        const handleSwipeEnd = (e) => {
            touchEndX = e.changedTouches[0].screenX;
            if (touchEndX < touchStartX - 60) { rendition.next(); showUI(); }
            if (touchEndX > touchStartX + 60) { rendition.prev(); showUI(); }
        };

        // UI Toggle in middle 50%
        const handleCenterTap = (e) => {
            const x = e.clientX;
            const y = e.clientY;
            const w = view.iframe.contentWindow.innerWidth;
            const h = view.iframe.contentWindow.innerHeight;
            if (x > w * 0.25 && x < w * 0.75 && y > h * 0.25 && y < h * 0.75) {
                if (document.body.classList.contains('hidden-ui')) { showUI(); } else { hideUI(); }
            } else {
                resetUITimer();
            }
        };

        doc.removeEventListener('keyup', cleanNavigation);
        doc.removeEventListener('touchstart', handleSwipeStart);
        doc.removeEventListener('touchend', handleSwipeEnd);
        doc.removeEventListener('click', handleCenterTap);

        doc.addEventListener('keyup', cleanNavigation);
        doc.addEventListener('touchstart', handleSwipeStart);
        doc.addEventListener('touchend', handleSwipeEnd);
        doc.addEventListener('click', handleCenterTap);
        
        // Ensure UI timer is reset on any interaction
        doc.addEventListener('touchstart', () => resetUITimer());
    });

    // Image Repair v3: Robust regex for blob URLs (replaces incorrectly prefixed ones)
    rendition.hooks.content.register((contents) => {
        const doc = contents.document;
        const fixImages = () => {
            const images = doc.querySelectorAll('img');
            images.forEach(img => {
                const src = img.getAttribute('src');
                const blobMatch = src ? src.match(/blob:https?:\/\/[^\s"']+/) : null;
                if (blobMatch && src !== blobMatch[0]) {
                    img.src = blobMatch[0];
                }
            });
        };
        fixImages();
        setTimeout(fixImages, 250); // Fallback for delayed loading
    });

    // Dark mode
    rendition.themes.register("dark", {
        "body": { "background": "#0f172a", "color": "#f8fafc" },
        "p": { "font-size": "1.1rem", "line-height": "1.6" },
        "h1, h2, h3, h4": { "color": "#f8fafc" }
    });
    rendition.themes.select("dark");

    // Precise position handling
    book.ready.then(() => {
        const savedLocation = localStorage.getItem(`epub-location-${filename}`);
        setTimeout(() => {
            if (savedLocation) {
                console.log('Jumping to saved location:', savedLocation);
                try {
                    rendition.display(savedLocation);
                } catch (e) {
                    console.error("Failed to jump to CFI:", e);
                    rendition.display();
                }
            } else {
                rendition.display();
            }
        }, 150); 
        book.locations.generate(1024).then(() => updatePageInfo());
    });

    rendition.on("relocated", function(location) {
        localStorage.setItem(`epub-location-${filename}`, location.start.cfi);
        updatePageInfo();
    });

    rendition.on("click", (e) => {
        showUI();
    });
}

// Stability: epub.js handles keyboard events internally inside the iframe.
// We remove parent-level listeners to avoid duplicate page-skipping.

function updatePageInfo() {
    if(!book || !rendition) return;
    const loc = rendition.currentLocation();
    if(loc && loc.start) {
        let percent = book.locations.percentageFromCfi(loc.start.cfi);
        let nicePercent = Math.round(percent * 100);
        pageInfo.innerText = nicePercent + "% gelesen";
    }
}

prevBtn.addEventListener('click', () => {
    if (rendition) rendition.prev();
});

nextBtn.addEventListener('click', () => {
    if (rendition) rendition.next();
});

// Toggle UI when clicking on empty background before book is loaded
document.body.addEventListener('click', (e) => {
    // Only toggle if not clicking on the header or footer
    if (e.target === document.body || e.target === viewer) {
        if (document.body.classList.contains('hidden-ui')) {
            showUI();
        } else {
            hideUI();
        }
    }
});

// Touch events for swipe gestures (main window empty state)
document.body.addEventListener("touchstart", event => {
    touchStartX = event.changedTouches[0].screenX;
});
document.body.addEventListener("touchend", event => {
    touchEndX = event.changedTouches[0].screenX;
    if(!rendition) return;
    if (touchEndX < touchStartX - 50) { rendition.next(); }
    if (touchEndX > touchStartX + 50) { rendition.prev(); }
});

// Show Translate Element when Custom Button is clicked
if (translateTrigger) {
    translateTrigger.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent UI hiding
        toggleLanguage();
    });
}

function toggleTTS() {
    // Stop any existing speech before starting new one to avoid "interrupted" errors
    window.speechSynthesis.cancel();

    if (synthStatus.isSpeaking) {
        synthStatus.isSpeaking = false;
        if (ttsTrigger) {
            ttsTrigger.innerText = "🔊 Vorlesen";
            ttsTrigger.style.backgroundColor = "var(--accent)";
        }
        return;
    }

    const activeIframe = viewer.querySelector('iframe');
    if (!activeIframe) return;

    const textToRead = activeIframe.contentDocument.body.innerText;
    if (!textToRead || textToRead.trim() === "") return;

    const utterance = new SpeechSynthesisUtterance(textToRead);
    
    // Auto detect language: Check if translate button says "Original"
    const isTranslated = !!(translateTrigger && translateTrigger.innerText.includes('Original'));
    utterance.lang = isTranslated ? 'de-DE' : 'en-US';
    
    // Better mobile voice discovery
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith(utterance.lang.split('-')[0])) || voices[0];
    if (voice) utterance.voice = voice;
    
    if (ttsSpeed) {
        utterance.rate = parseFloat(ttsSpeed.value) || 1.0;
    }

    utterance.onstart = () => {
        synthStatus.isSpeaking = true;
        if (ttsTrigger) {
            ttsTrigger.innerText = "⏹ Stopp";
            ttsTrigger.style.backgroundColor = "var(--error, #ef4444)";
        }
    };

    utterance.onend = () => {
        synthStatus.isSpeaking = false;
        if (ttsTrigger) {
            ttsTrigger.innerText = "🔊 Vorlesen";
            ttsTrigger.style.backgroundColor = "var(--accent)";
        }
    };

    utterance.onerror = (e) => {
        console.error("TTS Error:", e);
        synthStatus.isSpeaking = false;
        if (ttsTrigger) {
            ttsTrigger.innerText = "🔊 Vorlesen";
            ttsTrigger.style.backgroundColor = "var(--accent)";
        }
    };

    window.speechSynthesis.speak(utterance);
}

// Track speaking state explicitly
let synthStatus = { isSpeaking: false };

if (ttsTrigger) {
    ttsTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTTS();
    });
}

// Ensure TTS stops when changing chapters
rendition && rendition.on("relocated", function() {
    if(synth && synth.speaking) {
        synth.cancel();
        if(ttsTrigger) {
            ttsTrigger.innerText = "🔊 Vorlesen";
            ttsTrigger.style.backgroundColor = "var(--accent)";
        }
    }
});
// Start with UI visible, then hide after first load
showUI();
