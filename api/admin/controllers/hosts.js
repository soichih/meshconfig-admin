'use strict';

//contrib
const express = require('express');
const router = express.Router();
const winston = require('winston');
const jwt = require('express-jwt');
const async = require('async');

//mine
const config = require('../../config');
const logger = new winston.Logger(config.logger.winston);
const db = require('../../models');

function canedit(user, host) {
    if(user) {
        if(user.scopes.mca && ~user.scopes.mca.indexOf('admin')) return true; //admin can edit whaterver..
        if(host.admins && ~host.admins.indexOf(user.sub.toString())) return true;
    }
    return false;
}

/**
 * @api {get} /hosts            Query Hosts
 * @apiGroup                    Hosts
 * @apiDescription              Query hosts known to MCA
 *
 * @apiParam {Object} [find]    Mongo find query JSON.stringify & encodeURIComponent-ed - defaults to {}
 *                              To pass regex, you need to use {$regex: "...."} format instead of js: /.../ 
 * @apiParam {Object} [sort]    Mongo sort object - defaults to _id. Enter in string format like "-name%20desc"
 * @apiParam {String} [select]  Fields to return (admins will always be added). Multiple fields can be entered with %20 as delimiter
 * @apiParam {Number} [limit]   Maximum number of records to return - defaults to 100
 * @apiParam {Number} [skip]    Record offset for pagination (default to 0)
 * @apiHeader {String}          Authorization A valid JWT token "Bearer: xxxxx"
 *
 * @apiSuccess {Object}         hosts: List of host objects(hosts:), count: total number of hosts (for paging)
 */
router.get('/', jwt({secret: config.admin.jwt.pub}), function(req, res, next) {
    var find = {};
    if(req.query.find) find = JSON.parse(req.query.find);

    //we need to select admins , or can't get _canedit set
    var select = req.query.select;
    if(select && !~select.indexOf("admins")) select += " admins";

    db.Host.find(find)
    .select(select)
    .limit(parseInt(req.query.limit) || 100)
    .skip(parseInt(req.query.skip) || 0)
    .sort(req.query.sort || '_id')
    .lean() //so that I can add _canedit later
    .exec(function(err, hosts) {
        if(err) return next(err);
        db.Host.count(find).exec(function(err, count) {
            if(err) return next(err);
            
            //append canedit flag
            hosts.forEach(function(host) {
                host._canedit = canedit(req.user, host);
            });
            res.json({hosts: hosts, count: count});
        });
    });
});

/**
 * @api {post} /hosts               New Adhoc Host
 * @apiGroup                        Hosts
 * @apiDescription                  Register new adhoc host
 *
 * @apiParam {Object[]} services    List of service objects for this host (TODO - need documentation)
 * @apiParam {Boolean} [toolkit_url] (default: use hostname) URL to show for MadDash
 * @apiParam {Boolean} [no_agent]   Set to true if this host should not read the meshconfig (passive) (default: false)
 * @apiParam {String} [hostname]    (Adhoc only) hostname
 * @apiParam {String} [sitename]    (Adhoc only) sitename to show to assist hostname lookup inside MCA
 * @apiParam {Object} [info]        (Adhoc only) host information (key/value pairs of various info - TODO document)
 * @apiParam {String[]} [communities] (Adhoc only) list of community names that this host is registered in LS
 * @apiParam {String[]} [admins]    Array of admin IDs who can update information on this host
 *
 * @apiHeader {String} authorization A valid JWT token "Bearer: xxxxx"
 * @apiSuccess {Object}         Adhoc host registered
 */
router.post('/', jwt({secret: config.admin.jwt.pub}), function(req, res, next) {
    if(!req.user.scopes.mca || !~req.user.scopes.mca.indexOf('user')) return res.status(401).end();
    if(req.body.lsid) delete res.body.lsid;// make sure lsid is not set
    db.Host.create(req.body, function(err, host) {
        if(err) return next(err);
        host = JSON.parse(JSON.stringify(host));
        host._canedit = canedit(req.user, host);
        res.json(host);
    });
});

/**
 * @api {put} /hosts/:id        Update host
 * @apiGroup                    Hosts
 * @apiDescription              Update host registration (non-Adhoc host can only update services, no_agent, and toolkit_url)
 *
 * @apiParam {Object[]} services List of service objects for this host (TODO - need documentation)
 * @apiParam {Boolean} [toolkit_url] (default: use hostname) URL to show for MadDash
 * @apiParam {Boolean} [no_agent] Set to true if this host should not read the meshconfig (passive) (default: false)
 * @apiParam {String} [hostname] (Adhoc only) hostname
 * @apiParam {String} [sitename] (Adhoc only) sitename to show to assist hostname lookup inside MCA
 * @apiParam {Object} [info]    (Adhoc only) host information (key/value pairs of various info - TODO document)
 * @apiParam {String[]} [communities] (Adhoc only) list of community names that this host is registered in LS
 * @apiParam {String[]} [admins] Array of admin IDs who can update information on this host
 *
 * @apiHeader {String} authorization A valid JWT token "Bearer: xxxxx"
 * @apiSuccess {Object}         Host updated
 */
router.put('/:id', jwt({secret: config.admin.jwt.pub}), function(req, res, next) {
    db.Host.findById(req.params.id, function(err, host) {
        if(err) return next(err);
        if(!host) return res.status(404).end();
        if(!canedit(req.user, host)) return res.status(401).end();
        
        //somehow, mongo doesn't clear ma ref if it's *not set*.. I have to explicity set it to *undefined* 
        //to force mongo from clearing the ref.
        req.body.services.forEach(function(service) {
            if(!service.ma) service.ma = undefined;
        });

        //things always allowed to edit (TODO - shouldn't I have to mask fields not set?)
        host.no_agent = req.body.no_agent;
        host.toolkit_url = req.body.toolkit_url;
        host.services = req.body.services; //TODO should restrict to just MAs?
        host.update_date = new Date();

        if(!host.lsid) {
            //adhoc records can set more info
            host.hostname = req.body.hostname;
            host.sitename = req.body.sitename;
            host.info = req.body.info;
            //host.location = req.body.location;
            host.communities = req.body.communities;
            host.admins =  req.body.admins;
        }

        host.save(function(err) {
            if(err) return next(err);
            //console.log(JSON.stringify(host.services, null, 4));
            host = JSON.parse(JSON.stringify(host));
            host._canedit = canedit(req.user, host);
            res.json(host);
        }).catch(function(err) {
            next(err);
        });
    });
});

/**
 * @api {delete} /configs/:id   Remove hosts
 * @apiGroup                    Hosts
 * @apiDescription              Remove host registration - if it's not used by any hostgroup / config. 
 *                              Also, if it's not adhoc, the host will be reregistered again by cache service.
 * @apiHeader {String} authorization 
 *                              A valid JWT token "Bearer: xxxxx"
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *         "status": "ok"
 *     }
 */
router.delete('/:id', jwt({secret: config.admin.jwt.pub}), function(req, res, next) {
    db.Host.findById(req.params.id, function(err, host) {
        if(err) return next(err);
        if(!host) return next(new Error("can't find a host with id:"+req.params.id));
        
        async.series([
            //check access 
            function(cb) {
                if(canedit(req.user, host)) {
                    cb();
                } else {
                    cb("You don't have access to remove this host");
                }
            },
            
            //check foreign key dependencies on host.ma
            function(cb) {
                db.Host.find({"services.ma": host._id}, function(err, hosts) {
                    if(err) return cb(err);
                    var names = "";
                    hosts.forEach(function(host) {
                        names+=host.hostname+" ";
                    });
                    if(names == "") {
                        cb();
                    } else {
                        cb("You can not remove this host. It is currently referenced as MA in hosts: "+names);
                    }
                }); 
            },

            //check foreign key dependencies on hostgroup.hosts
            function(cb) {
                db.Hostgroup.find({"hosts": host._id}, function(err, hostgroups) {
                    if(err) return cb(err);
                    var names = "";
                    hostgroups.forEach(function(hostgroup) { names+=hostgroup.name+", "; });
                    if(names == "") {
                        cb();
                    } else {
                        cb("You can not remove this host. It is currently referenced in hostgroups: "+names);
                    }
                }); 
            },
            
            //check foreign key dependencies on config test (center / nahosts)
            function(cb) {
                db.Config.find({$or: [
                    {"tests.center": host._id},
                    {"tests.nahosts": host._id},
                ]}, function(err, configs) {
                    if(err) return cb(err);
                    var names = "";
                    configs.forEach(function(config) { names+=config.name+", "; });
                    if(names == "") {
                        cb();
                    } else {
                        cb("You can not remove this host. It is currently referenced in configs: "+names);
                    }
                }); 
            },

        ], function(err) {
            if(err) return next(err);
            //all good.. remove
            host.remove().then(function() {
                res.json({status: "ok"});
            }); 
        });
    });
});

module.exports = router;

