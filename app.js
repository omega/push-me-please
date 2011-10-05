#!/usr/bin/env node
/**
 * Module dependencies.
 */

var config = require('confu')(__dirname, 'config.json');

var express = require('express')
  , https = require('https')
  , http = require('http')
  , URL = require('url')
  , SAX = require('sax')
  , events = require('events')

;

var app = module.exports = express.createServer();

var postbin = URL.parse(config.postbin);
var test_url = URL.parse(config.testurl);

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes

var DB = [];
var TS = '';

app.get('/', function(req, res){
    res.render('index', {
        title: 'push-me-please',
        db: DB,
        ts: TS,
        bah: 'bah'
    });
});


app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);

var timer = setInterval(POLL, 60*1000);
setTimeout(POLL, 1);

function POLL() {

    var parser = new AtomParser();
    // Trigger a "test-hook"
    var auth = "Basic " + new Buffer(test_url.auth).toString("base64")
    https.get({
        host: test_url.hostname,
        port: test_url.port,
        path: test_url.pathname,
        method: "POST",
        headers: {
            "Authorization": auth
        }
    }, function(res) {
        console.log("POST placed", res.statusCode, TS, DB);
    }).on('error', function(err) {
        console.error("POST error: ", err);
    });
    // get the feed
    console.log(postbin.pathname);
    http.get({
        host: postbin.hostname,
        port: postbin.port,
        path: postbin.pathname
    }, function(res) {
        res.on('data', function(d) {
            parser.write(d.toString());
        });

    }).on('error', function(err) {
        console.log("FEED ERROR: ", err);
    });
}


function AtomParser() {
    events.EventEmitter.call(this);
    var self = this;
    this.sax = SAX.parser(false, {lowercasetags: true, trim: true});
    self.e = null;
    self.began = false;
    self.ts = false;
    self.sax.ontext = function(text) {
        //console.log(text);
        if (self.ts) {
            TS = text;
            self.ts = false;
            return;
        }

        if (self.e == null) return;
        self.e += text;
    };
    self.sax.onopentag = function(node) {
        //console.log("+node.name: ", node.name);
        if (node.name == "entry") return self.began = true;
        if (node.name == "title") return self.e = "";
        if (!self.began && node.name == "updated") return self.ts = true;
    };
    self.sax.onclosetag = function(name) {
        //console.log("-node.name: ", name);
        if (self.began && name == "title") {
            var title = self.e;
            var m = title.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (m) {
                if (!DB.some(function(v) {
                    return m[1] == v;
                })) {
                    DB.push(m[1]);
                }
                DB.sort();
            }
            self.e = null;
        }
    };
}
AtomParser.super_ = events.EventEmitter;
AtomParser.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
                     value: AtomParser,
                     enumerable: false
                 }
});

AtomParser.prototype.write = function(data) {this.sax.write(data);};


