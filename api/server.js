#!/usr/bin/node

//node
var fs = require('fs');
var path = require('path');

//contrib
var express = require('express');
//var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
//var expressValidator = require('express-validator');
//var Sequelize = require('sequelize');
var winston = require('winston');
var expressWinston = require('express-winston');

//mine
var config = require('./config/config');
var logger = new winston.Logger(config.logger.winston);
var models = require('./models');

//init express
var app = express();
app.use(bodyParser.json()); //parse application/json
//app.use(bodyParser.urlencoded({extended: false})); //parse application/x-www-form-urlencoded
app.use(expressWinston.logger(config.logger.winston));
//app.use(cookieParser());

//app.use(jwtTokenParser());

//setup routes
app.use('/', require('./controllers'));
app.get('/health', function(req, res) {
    res.json({status: 'ok'});
});

//error handling
app.use(expressWinston.errorLogger(config.logger.winston)); 
app.use(function(err, req, res, next) {
    logger.error(err);
    logger.error(err.stack);
    res.status(err.status || 500);
    res.json({message: err.message, /*stack: err.stack*/}); //let's hide callstack for now
});

process.on('uncaughtException', function (err) {
    //TODO report this to somewhere!
    logger.error((new Date).toUTCString() + ' uncaughtException:', err.message)
    logger.error(err.stack)
    //process.exit(1); //some people think we should do this.. but I am not so sure..
})

exports.app = app;
exports.start = function() {
    models.sequelize.sync({force: true}).then(function() {
        var port = process.env.PORT || config.express.port || '8080';
        var host = process.env.HOST || config.express.host || 'localhost';
        app.listen(port, host, function() {
            console.log("Profile service running on %s:%d in %s mode", host, port, app.settings.env);
        });
    });
}

