const express = require('express')

const cookieParser = require('cookie-parser')

const app = express()

app.use('/public', express.static('public'))

app.use(cookieParser())

const _api = require('./api/api')

const favicon = require('serve-favicon');

app.use(favicon(__dirname + '/public/favicon.ico'));

app.get('/:game?', (req, res) => _api(req, res))

app.listen(3000)