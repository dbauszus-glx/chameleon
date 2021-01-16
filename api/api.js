const { readFileSync } = require('fs')

const { join } = require('path')

const { Firestore } = require('@google-cloud/firestore')

const db = new Firestore({
  projectId: 'cloudchameleon',
  keyFilename: join(__dirname, `../${process.env.keyfilename}`),
})

const Pusher = require("pusher");

const pusher = new Pusher({
  appId: "1137484",
  key: "065a9437ed18c2bd556d",
  secret: process.env.secret,
  cluster: "eu",
  useTLS: true
})

const { customAlphabet } = require('nanoid')

const nanoid = customAlphabet('123456789aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ', 6)

const cards = require('../cards')

module.exports = async (req, res) => {

  // Vercel provides query params in the query instead of the params object.
  req.params = req.params || req.query

  // Get the player from the cookie.
  req.params.player = req.cookies 
    && req.cookies.cloudchameleon 
    && JSON.parse(req.cookies.cloudchameleon)

  // Create a new game.
  if (typeof req.query.new !== 'undefined') {

    return newGame(req, res)
  }

  // Return card keys. Doesn't require game data.
  if (typeof req.query.cards !== 'undefined') {
    return res.send(Object.keys(cards))
  }

  // Get game details from firestore.
  if (req.params.game) {

    // Create firestore reference from game id.
    req.params.docRef = db.collection('games').doc(req.params.game)

    // Get game from firestore reference.
    const game = await req.params.docRef.get()

    // Return if the game doesn't exist.
    if (!game.exists) return res.status(404).send(`Game does not exist`)
  
    // Get game data.
    req.params.game = await game.data()

    // Assign player to game data.
    req.params.game.player = req.params.player || null
  }

  // A player (from cookie) will join an existing game.
  if (req.params.player && req.params.game && !req.params.game.players.find(player => player.id === req.params.player.id)) {

    return joinExisting(req, res)
  }

  // Join game as a new player.
  if (req.query.join) {

    return joinNew(req, res)
  }

  // Leave game.
  if (req.params.player && typeof req.query.leave !== 'undefined') {

    return leaveGame(req, res)
  }

  // Get the current word.
  if (req.params.player && typeof req.query.word !== 'undefined') {

    // The first player in the array is the chameleon and will not receive the word.
    if (req.params.game.players[0].id !== req.params.player.id) {
      return res.send(req.params.game.word)
    }

    // ...but 'Chameleon' instead.
    return res.send('Chameleon')
  }

  // Guess the word. Ends the round.
  if (req.params.player && req.query.guess) {

    return guess(req, res)
  }

  // Set a card. Starts round.
  if (req.params.player && req.query.card && cards[req.query.card]) {

    return setCard(req, res)
  }

  // Get game data.
  if (typeof req.query.get !== 'undefined') {

    // Return game data.
    return res.send(req.params.game || {})
  }

  // Return game template.
  res.send(readFileSync(join(__dirname, '../public/game.html')).toString('utf8'))
}

async function newGame(req, res) {

  // Create a new game object.
  const game = {
    id: nanoid(),
    players: []
  }

  // Add player (from cookie) to game.
  req.params.player && game.players.push(req.params.player)

  // Create firestore doc reference.
  const docRef = db.collection('games').doc(game.id)

  // Set game object in firestore.
  await docRef.set(game)

  // Set location to the game id.
  res.setHeader('location', `/${game.id}`)

  // Redirect to the game id location.
  res.status(302).send()
}

async function joinExisting(req, res) {

  // Join is only possible when players are in the lounge.
  if (req.params.game.card) {
    return res.send('Cannot join game in progress.')
  }

  // Reset score.
  req.params.player.score = 0

  // Push player into game.
  req.params.game.players.push(req.params.player)

  // Update game in firestore.
  await req.params.docRef.set(req.params.game)

  // Trigger lounge event on pusher channel.
  await pusher.trigger(req.params.game.id, "lounge", true)

  // Return game template.
  res.send(readFileSync(join(__dirname, '../public/game.html')).toString('utf8'))
}

async function joinNew(req, res) {

  // Join is only possible when players are in the lounge.
  if (req.params.game.card) {
    return res.send('Cannot join game in progress.')
  }

  // Create player object.
  const player = {
    id: nanoid(),
    name: req.query.join,
    score: 0
  }

  // Push player into game.
  req.params.game.players.push(player)

  // Update game data in firestore.
  await req.params.docRef.set(req.params.game)

  // Set cookie for the new player.
  res.setHeader('Set-Cookie', `cloudchameleon=${JSON.stringify(player)};`)

  // Trigger lounge event on pusher channel.
  await pusher.trigger(req.params.game.id, "lounge", true)

  res.send(`${player.name} has joined the game.`)
}

async function leaveGame(req, res) {

  // Leaving is only possible when players are in the lounge.
  if (req.params.game.card) {
    return res.send('Cannot leave game in progress.')
  }

  // Splice player from game.
  for(var i = 0; i < req.params.game.players.length; i++) {
    if(req.params.game.players[i].id === req.params.player.id) {
      req.params.game.players.splice(i, 1);
      break;
    }
  }

  // Update game in firestore.
  await req.params.docRef.set(req.params.game)

  // Set player cookie to null.
  res.setHeader('Set-Cookie', `cloudchameleon=null;Max-Age=0`)

  // Trigger lounge event.
  await pusher.trigger(req.params.game.id, "lounge", true)

  res.send(`${req.params.player.name} has left the game.`)
}

async function guess(req, res) {

  // Only the chameleon may make a guess.
  if (req.params.game.players[0].id !== req.params.player.id) {
    return res.send('Only the Chameleon may guess the word.')
  }

  // Guessing 'Chameleon' indicates that the Chameleon has escaped undetected.
  if (req.query.guess === 'Chameleon') {

    // The Chameleon will get 2 points.
    req.params.game.players[0].score += 2
  }

  // The Chameleon guessed correct.
  if (req.query.guess === req.params.game.word) {

    // The Chameleon will receive 1 point.
    req.params.game.players[0].score += 1
  } 
  
  // The Chameleon guessed poorly.
  if (req.query.guess !== 'Chameleon' && req.query.guess !== req.params.game.word) {

    // Every player but the Chameleon will receive a point.
    req.params.game.players[0].score -= 1
    req.params.game.players.forEach(player => player.score++)
  }

  // Delete the game card.
  delete req.params.game.card

  // Update the game in firestore.
  await req.params.docRef.set(req.params.game)

  // Move the players into the lounge by triggering the pusher channel event.
  await pusher.trigger(req.params.game.id, "lounge", true)
  
  res.send('Round ends.')
}

async function setCard(req, res) {

  // Only the dealer can set a new card.
  if (req.params.game.players[0].id !== req.params.player.id) {
    return res.send('Only the dealer can request a card.')
  }

  // A card can only be set in the lounge.
  if (req.params.game.card) {
    return res.send('A card can only be set in the lounge.')
  }

  // The card wasn't found in the game.
  if (!cards[req.query.card]) {
    return res.send(`${req.query.card} not found in game.`)
  }

  // Set the game card.
  req.params.game.card = {
    title: req.query.card,
    words: cards[req.query.card]
  }

  // Determine who is the Chameleon.
  req.params.game.chameleon = req.params.game.players[Math.floor(Math.random() * Math.floor(req.params.game.players.length))].id

  // Sort the players array, to move the Chameleon to the top.
  req.params.game.players.sort((a,b) => {
    if (a.id === req.params.game.chameleon) return -1
  })

  // Determine the secret word for the current card.
  req.params.game.word = cards[req.query.card][Math.floor(Math.random() * Math.floor(cards[req.query.card].length))]

  // Update game data in firestore.
  req.params.docRef.set(req.params.game)

  // Trigger card event on pusher channel.
  await pusher.trigger(req.params.game.id, "card", {
    title: req.query.card,
    words: cards[req.query.card]
  })

  res.send(req.query.card)
}