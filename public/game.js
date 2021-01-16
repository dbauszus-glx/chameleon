const pusher = new Pusher('065a9437ed18c2bd556d', {
  cluster: 'eu'
});

let channel

const frame = document.getElementById('frame');

// IIFE to get game data.
(function getGame() {
  fetch('?get')
    .then(response => response.json())
    .then(game => {

      // Start new game if no game data returned from host.
      if (Object.keys(game).length === 0) {

        // Render new game link into frame.
        return uhtml.render(frame, uhtml.html`
          <a class="title clickable" href="/?new">New Game`)
      }

      // Initiate pusher channel if non exist.
      if (!channel) {

        // Sunscribe channel to game id.
        channel = pusher.subscribe(game.id);

        // Bind lounge event.
        channel.bind('lounge', getGame);

        // Bind card event.
        channel.bind('card', data => setCard(data));
      }

      // Set game card if provided with game data.
      if (game.card) return setCard(game.card)

      // Set lounge if no game card is present.
      lounge(game)

    });
})()

// The lounge is displayed in between rounds. Players may join and leave.
function lounge(game) {

  // Populate player list in lounge.
  const html = uhtml.html.node`
    <div class="title">Lounge</div>
    <ul>${game.players.map(player => uhtml.html`
      <li class="${game.player && game.player.id === player.id && 'highlight' || ''}">
        ${player.name} - ${player.score}`)}`

  // Allow to join lounge if player isn't in game.
  if (!game.player) {

    html.appendChild(uhtml.html.node `
      <input placeholder="Name" type=text />
      <button onclick=${join}>Join`)

    function join(e) {
      e.preventDefault()
      fetch(`?join=${e.target.previousElementSibling.value || 'anonymous'}`)
        .then(()=>window.location.reload())
      frame.innerHTML = ''
    }
  }

  // Allow players to leave from lounge.
  if (game.player) {

    html.appendChild(uhtml.html.node `
      <button onclick=${leave}>Leave`)
  
    function leave(e) {
      e.preventDefault()
      fetch(`?leave`)
        .then(()=>window.location.reload())
      frame.innerHTML = ''
    }
  }

  // The first player in the players array is the dealer.
  if (game.player && game.players[0] && game.player.id === game.players[0].id) {
    html.appendChild(uhtml.html.node`
    <div class="notes">You are the dealer. You may select a card for the <span
      class="clickable" onclick=${getCards}>next round</span>.</div>`)
  }

  // Render lounge into frame.
  uhtml.render(frame, html)
}

// Get cards from host.
function getCards() {
  fetch('?cards')
    .then(response => response.json())
    .then(cards => {

      const html = uhtml.html.node`
        <div class="title">Select card</div>
        <ul>${cards.map(card => uhtml.html`
          <li onclick=${selectCard}>${card}`)}`
      
      uhtml.render(frame, html)

      function selectCard(e){
        fetch(`?card=${e.target.textContent}`)
          .then(response => console.log(response))
      }
    })
}

// Triggered by the card pusher channel.
function setCard(card) {

  fetch('?word')
    .then(response => response.text())
    .then(word => {

      // Remder words into card.
      // The chameleon does not know the word.
      const html = uhtml.html.node`
        <div class="title">${card.title}</div>
        <ul>${card.words.map(_word => uhtml.html`
          <li class="${word === _word && 'highlight' ||''}">${_word}`)}`

      // The chameleon receives 'Chameleon' as word.
      if (word === 'Chameleon') {
        
        html.querySelectorAll('li').forEach(li => {
          li.onclick = e => guessWord(e, li.textContent)
        })

        html.appendChild(uhtml.html.node`
          <div class="notes">You are the Chameleon. You may guess a word implying that you were caught or deal the next round if <span
            class="clickable" onclick=${e => guessWord(e, null)}>undetected</span>.</div>`)
      }
    
      uhtml.render(frame, html)

    })

  function guessWord(e, word) {

    e.preventDefault()
  
    if (word) return confirmDialog(`Would you like to guess "${word}"?`, guess)
  
    confirmDialog(`Did you escape detection?`, guess)

    function guess() {

      fetch(`?guess=${word || 'Chameleon'}`)
        .then(response => console.log(response))

    }
  }

}

function confirmDialog(message, fn) {

  const dialog = document.body.appendChild(uhtml.html.node`
    <div class="mask">
      <div class="title">${message}</div>
      <button onclick=${()=>{fn();dialog.remove()}}>Confirm</button>
      <button onclick=${()=>dialog.remove()}>Cancel</button>`)

}