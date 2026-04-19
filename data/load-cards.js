// Card source — bundled cards.json
// Exposed as window.loadCards()

async function loadCards() {
  const res = await fetch('data/cards.json');
  return res.json();
}

window.loadCards = loadCards;
