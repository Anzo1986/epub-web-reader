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

    book = ePub(bookData);
    
    // Render
    rendition = book.renderTo("viewer", {
        width: "100%",
        height: "100%",
        spread: "none",
        manager: "continuous",
        flow: "paginated"
    });

    // Dark mode for the iframe content
    rendition.themes.register("dark", {
        "body": { "background": "#0f172a", "color": "#f8fafc" },
        "p": { "font-size": "1.1rem", "line-height": "1.6" },
        "h1, h2, h3, h4": { "color": "#f8fafc" }
    });
    rendition.themes.select("dark");

    // Check if we have a saved location for this book
    const savedLocation = localStorage.getItem(`epub-location-${filename}`);
    
    if (savedLocation) {
        rendition.display(savedLocation);
    } else {
        rendition.display();
    }

    // Navigation Events
    book.ready.then(() => {
        return book.locations.generate(1600); // Generate locations for accurate progress
    }).then(() => {
        updatePageInfo();
    });

    rendition.on("relocated", function(location) {
        localStorage.setItem(`epub-location-${filename}`, location.start.cfi);
        updatePageInfo();
    });

    // Bind events directly to the iframe document for reliability
    rendition.on("rendered", (e, iframe) => {
        const doc = iframe.document.documentElement;

        // Toggle UI on middle tap
        doc.addEventListener('click', (e) => {
            const x = e.clientX;
            const y = e.clientY;
            const w = iframe.innerWidth;
            const h = iframe.innerHeight;
            if (x > w * 0.25 && x < w * 0.75 && y > h * 0.25 && y < h * 0.75) {
                document.body.classList.toggle('hidden-ui');
            }
        });

        // Swipe Gestures
        doc.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });

        doc.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            if (touchEndX < touchStartX - 50) { rendition.next(); }
            if (touchEndX > touchStartX + 50) { rendition.prev(); }
        });

        // Arrow Keys
        doc.addEventListener('keyup', (e) => {
            if (e.key === "ArrowLeft") { rendition.prev(); }
            if (e.key === "ArrowRight") { rendition.next(); }
        });
    });
}

// Global Keyboard navigation (main window)
document.addEventListener("keyup", function(e) {
    if(!rendition) return;
    if (e.key === "ArrowLeft") { rendition.prev(); }
    if (e.key === "ArrowRight") { rendition.next(); }
});

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
        document.body.classList.toggle('hidden-ui');
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
    translateTrigger.addEventListener('click', () => {
        const gt = document.getElementById('google_translate_element');
        if(gt) {
            gt.style.display = 'block';
            translateTrigger.style.display = 'none'; // hide the custom button once active
        }
    });
}

// Text to Speech (TTS) Logic
if (ttsTrigger) {
    ttsTrigger.addEventListener('click', () => {
        if (synth.speaking) {
            synth.cancel();
            ttsTrigger.innerText = "🔊 Vorlesen";
            ttsTrigger.style.backgroundColor = "var(--accent)";
            return;
        }

        const activeIframe = document.querySelector('#viewer iframe');
        if (!activeIframe) return;

        // Grab text from the currently rendered chapter
        const textToRead = activeIframe.contentDocument.body.innerText;
        if (!textToRead || textToRead.trim() === "") return;

        currentUtterance = new SpeechSynthesisUtterance(textToRead);
        
        // Speed
        if (ttsSpeed) {
            currentUtterance.rate = parseFloat(ttsSpeed.value);
        }

        // Determine language: If Google Translate is active, use German voice. Otherwise English.
        const isTranslated = document.documentElement.classList.contains('translated-ltr') || document.documentElement.classList.contains('translated-rtl');
        currentUtterance.lang = isTranslated ? 'de-DE' : 'en-US';
        
        currentUtterance.onend = () => {
            ttsTrigger.innerText = "🔊 Vorlesen";
            ttsTrigger.style.backgroundColor = "var(--accent)";
        };

        ttsTrigger.innerText = "⏹ Stopp";
        ttsTrigger.style.backgroundColor = "var(--error, #ef4444)";
        synth.speak(currentUtterance);
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
