// Card source — IndexedDB imported deck first, bundled cards.json fallback
// Exposed as window.loadCards()

async function loadCards() {
  if (window.DB) {
    try {
      await window.DB.open();
      const imported = await window.DB.getImportedCards();
      if (imported.length > 0) return imported;
    } catch (e) {
      // fall through to bundled
    }
  }
  const res = await fetch('data/cards.json');
  return res.json();
}

window.loadCards = loadCards;
