var http = require("http"),
    sys = require("util"),
    socketio = require("socket.io"),
    fs = require("fs"),
    mustache = require("mustache"),
    express = require("express"),
    config = require("./config").config,
    locales = require("./locales").locales,
    referee = require("./referee"),
    te = require("./tableevents").TableEvents;

var app = express(),
    sockapp = express(); 
var appengine, sockappengine;

app.configure(function() {
  app.set("views", __dirname + "/../views");
  app.set("view options", {layout: false});
  app.set("view engine", "html");

app.engine(".html", function(path, options, fn) {
  	fs.readFile(path, 'utf8', function(err, str)	{
    	if (err) return fn(err);
    	str = mustache.to_html(str, data);
    	fn(null, str);
  	});
  });

  //app.use(express.compiler({ src: __dirname + "/../public", enable: ["less"] }));
  app.use(express.favicon(__dirname + "/../public/images/favicons/fi_standard.ico"));
  app.use(express.static(__dirname + "/../public"));
});

app.configure("production", function() {
  sys.debug("Using express.js config for \x1b[1mproduction\x1b[0m mode\n");
  app.use(express.logger({
    format: ":date :method :status HTTP/:http-version :url :response-time  :user-agent",
    stream: fs.createWriteStream(__dirname + "/../../../shared/logs/access_" + new Date().getTime() + ".log")
  }));
  app.use(express.errorHandler());
});

app.configure("development", function() {
  sys.debug("Using express.js config for \x1b[1mdevelopment\x1b[0m mode\n");
  app.use(express.logger({format: "\x1b[1m:method\x1b[0m :status HTTP/:http-version \x1b[33m:url\x1b[0m :response-time"}));
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.post("/events/*", function(req, res){
  var parts = req.url.split("/"),
      type = parts[2],
      action = parts[3],
      opts = {"Content-Type": "text/plain"};

  if ({goals:true, undo:true}[type] && {visitors: true, home: true}[action]) {
    te.publish("arduino:"+type, action);

    res.writeHead(200, opts);
    res.end("Added Goal for " + action);
  } else {
    res.writeHead(404, opts);
    res.end();
  }
});

var data = {
  production: /\bproduction\b/.test(process.env.NODE_ENV),
  cdn: config.cdn,
  rev: config.rev,
  scoreboard: config.scoreboard,
  config: JSON.stringify({
    env: process.env.NODE_ENV,
    scoreboard: config.scoreboard,
    ga: config.ga,
    socketconf: config.socketconf
  })
};

data.locales = locales;

app.get('/', function(req, res){
  //don't switch scoreboard on wall mounted iPad
  //should be checked with cookie value
  if(req.headers['user-agent'].indexOf("iPad") != -1) { 
    data.scoreboard.inverted = false;
  }
  res.render("index", data);
});

app.get('/league', function(req, res) {
  res.redirect("http://foosball.hq.axiosengineering.com:5984/digitalfoosball/_design/league/_rewrite/");
})

app.get("/dialog", function(req, res) {
  res.render("partials/dialog", data);
});

appengine = app.listen(config.server.port);
sys.debug("\x1b[1mExpress server started on port " + appengine.address().port + "\x1b[0m");
 		 
sockappengine = sockapp.listen(config.server.socketport);
sys.debug("\x1b[1mExpress WebSocket server started on port " + sockappengine.address().port + "\x1b[0m\n");
 		 
var io = socketio.listen(sockappengine);
io.sockets.on("connection", function(socket) {
  te.subscribeOnce("referee:welcome", function(msg) {
    var copy = JSON.parse(JSON.stringify(msg));
    msg.time = new Date().getTime();
    socket.json.send(msg);
  });
  te.publish("socket:connect", socket);

  socket.on("message", function(msg) {
    te.publish("socket:message", socket, msg);
  });

  socket.on("disconnect", function() {
    te.publish("socket:disconnect", socket);
  });
});

te.subscribe("referee:update", function(msg) {
  io.sockets.json.send(msg);
});

process.on("uncaughtException", function (err) {
  sys.debug("[UNCAUGHT EXCEPTION] " + err + "\n" + JSON.stringify(err, null, " "));
  console.log(err);
  console.log(err.stack);
  process.exit();
});

