#!/usr/bin/env node

/**
 * @type {any}
 */
const WebSocket = require('ws')
const http = require('http')
const wss = new WebSocket.Server({ noServer: true })
const setupWSConnection = require('./utils.js').setupWSConnection
// SST: performance measure
const os 	= require('os');
// SST: notifications
const subscriptions = require('./utils.js').subscriptions
const notifications = require('./utils.js').notifications
const hostAndPort = require('./utils.js').hostAndPort

const host = process.env.HOST || 'localhost'
// SST: changed from fallback 1234 to 80
const port = process.env.PORT || 80
// SST: changed
const providerFallbacks = JSON.parse(process.env.PROVIDER_FALLBACKS || `[
  ["websocket", ["https://the-decentral-web.loca.lt", "https://decentralninja.loca.lt", "wss://the-decentral-web.herokuapp.com"]],
  ["webrtc", ["https://the-decentral-web-rtc.loca.lt"]]
]`)
// SST: changed
const customMessage = process.env.CUSTOM_MESSAGE || 'This is my websocket provider.'
// SST: feed the origin back
hostAndPort.host = host
hostAndPort.port = port

const server = http.createServer((request, response) => {
  // SST: Escape for Notification, etc.
  if (request.method === 'OPTIONS') {
    response.writeHead(202, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
    response.end('go ahead')
    return
  } else if (request.url === '/get-info') {
    response.writeHead(201, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
    response.end(JSON.stringify({
      os: {
        cpus: os.cpus(),
        freemem: os.freemem(),
        totalmem: os.totalmem(),
        loadavg: os.loadavg(),
        uptime: os.uptime()
      },
      providerFallbacks,
      customMessage
    }))
    return
  } else if (request.url === '/subscribe' || request.url === '/unsubscribe' || request.url === '/get-notifications') {
    let body = ''
    request.on('data', chunk => body += chunk)
    request.on('end', () => {
      if (!body) {
        response.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
        response.end('requires body aka payload')
        return
      }
      try {
        body = JSON.parse(body.replace(/'/g, '"')) || null
      } catch (e) {
        body = null
      }
      if (request.url === '/get-notifications') {
        if (!Array.isArray(body)) {
          response.writeHead(201, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
          response.end(JSON.stringify([]))
          return
        }
        response.writeHead(201, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
        const result = {}
        body.forEach(roomName => (result[roomName] = notifications[roomName] || []))
        response.end(JSON.stringify(result))
        return
      } else {
        if (!body || !body.room) {
          response.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
          response.end('body payload requires the property room, userVisibleOnly and applicationServerKey as string!')
          return
        }
        const room = body.room
        delete body.room
        const subscription = subscriptions.get(room)
        const getIndex = () => Array.isArray(subscription)
          ? subscription.findIndex(sub => JSON.stringify(sub.keys) === JSON.stringify(body.keys))
          : -1
        if (request.url === '/subscribe') {
          // subscribe
          if (subscription) {
            if (getIndex() === -1) subscription.push(body)
          } else {
            subscriptions.set(room, [body])
          }
        } else if (subscription) {
          // unsubscribe
          const index = getIndex()
          if (index !== -1) subscription.splice(index, 1)
        }
      }
      response.writeHead(201, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
      response.end(request.url + 'done')
    })
    return
  }
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

wss.on('connection', setupWSConnection)

server.on('upgrade', (request, socket, head) => {
  // You may check auth of request here..
  // See https://github.com/websockets/ws#client-authentication
  /**
   * @param {any} ws
   */
  const handleAuth = ws => {
    wss.emit('connection', ws, request)
  }
  wss.handleUpgrade(request, socket, head, handleAuth)
})

// SST: changed from "port, host, ()" to only "port, ()" to not pass host at all, works on heroku
server.listen(port, () => {
  console.log(`running at '${host}' on port ${port}`)
})
