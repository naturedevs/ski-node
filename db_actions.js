
// database connection
var mysql      = require('mysql');
var Q = require('q');

var exports = module.exports = {};

var dbconnection = mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'qaz123',
    database: process.env.DB_DATABASE || 'equestre'
});

exports.findEvent = function(eventTitle, eventDate) {
    var deferred = Q.defer();
    dbconnection.query('SELECT * from tb_events WHERE eventName = ? AND eventDate = ?',
        [eventTitle, eventDate],
        function(err, results, fields) {
            if(err) {
                deferred.reject(new Error(err));
            } else {
                if(results.length !== 0) {
                    eventId = results[0]['id'];
                    console.log("findEvent: find event id=" + eventId);
                    deferred.resolve(eventId);
                } else {
                    deferred.resolve(0);
                }
            }
        });
    return deferred.promise;
};

exports.addEvent = function(eventInfo) {
    var deferred = Q.defer();
    dbconnection.query('INSERT INTO tb_events(eventName, eventDate, title, titleStart, titleEnd, roundNumber, jumpoffNumber) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [eventInfo.eventTitle, eventInfo.eventDate, eventInfo.title, eventInfo.startDate, eventInfo.endDate, eventInfo.roundNumber, eventInfo.jumpoffNumber],
        function (err, results, fields) {
            if(err) {
                deferred.reject(new Error(err));
            } else {
                let eventId = results.insertId;
                console.log("addEvent: insert event id=" + eventId);
                deferred.resolve(eventId);
            }
        });

    return deferred.promise;
};

exports.deleteHorses = function(eventId) {
    var deferred = Q.defer();
    dbconnection.query('DELETE FROM tb_horses WHERE eventId = ?', [eventId], function (err, results, fields) {
        if(err) {
            deferred.reject(new Error(err));
        } else {
            console.log('deleteHorses: delete records=' + results.affectedRows);
            deferred.resolve(results.affectedRows);
        }
    });
    return deferred.promise;
};

exports.addHorse = function(eventId, horse) {
    var deferred = Q.defer();

    dbconnection.query('INSERT INTO tb_horses(eventId, number, name, age, birthday, owner) VALUES (?, ?, ?, ?, ?, ?)',
        [eventId, horse.idx, horse.name, horse.age, horse.birthday, horse.owner],
        function (err, results, fields) {
            if(err) {
                deferred.reject(new Error(err));
            } else {
                deferred.resolve(1);
            }
        });

    return deferred.promise;
};

exports.deleteRiders = function(eventId) {
    var deferred = Q.defer();
    dbconnection.query('DELETE FROM tb_riders WHERE eventId = ?', [eventId], function (err, results, fields) {
        if(err) {
            deferred.reject(new Error(err));
        } else {
            console.log('deleteRiders: delete records=' + results.affectedRows);
            deferred.resolve(results.affectedRows);
        }
    });
    return deferred.promise;
};


exports.addRider = function(eventId, rider) {
    var deferred = Q.defer();

    dbconnection.query('INSERT INTO tb_riders(eventId, number, firstName, lastName, birthday, nation) VALUES (?, ?, ?, ?, ?, ?)',
        [eventId, rider.idx, rider.firstName, rider.lastName, rider.birthday, rider.nation],
        function (err, results, fields) {
            if(err) {
                deferred.reject(new Error(err));
            } else {
                deferred.resolve(1);
            }
        });

    return deferred.promise;
};


exports.deleteRankings = function(eventId) {
    var deferred = Q.defer();

    dbconnection.query('DELETE FROM tb_ranks WHERE eventId = ?', [eventId], function (err, results, fields) {
        if(err) {
            deferred.reject(new Error(err));
        } else {
            console.log('ranking command: delete records=' + results.affectedRows);
            deferred.resolve(results.affectedRows);
        }
    });

    return deferred.promise;
};


exports.addRanking = function(eventId, rank) {
    var deferred = Q.defer();

    dbconnection.query('INSERT INTO tb_ranks(eventId, number, rank, point1, pointPlus1, time1, timePlus1, point2, pointPlus2, time2, timePlus2, jumpOff) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [eventId, rank.num, rank.rank, rank.point1, rank.pointPlus1, rank.time1, rank.timePlus1, rank.point2, rank.pointPlus2, rank.time2, rank.timePlus2, rank.jumpOff?1:0],
        function (err, results, fields) {
            if(err) {
                deferred.reject(new Error(err));
            } else {
                deferred.resolve(1);
            }
        });

    return deferred.promise;
};


exports.deleteStartLists = function(eventId) {
    var deferred = Q.defer();

    dbconnection.query('DELETE FROM tb_startlist WHERE eventId = ?', [eventId], function (err, results, fields) {
        if(err) {
            deferred.reject(new Error(err));
        } else {
            console.log('ranking command: delete records=' + results.affectedRows);
            deferred.resolve(results.affectedRows);
        }
    });

    return deferred.promise;
};


exports.addStartList = function(eventId, startlistentry) {
    var deferred = Q.defer();

    dbconnection.query('INSERT INTO tb_startlist(eventId, pos, num, horse_idx, rider_idx) VALUES (?, ?, ?, ?, ?)',
        [eventId, startlistentry.pos, startlistentry.num, startlistentry.horse_idx, startlistentry.rider_idx],
        function (err, results, fields) {
            if(err) {
                deferred.reject(new Error(err));
            } else {
                deferred.resolve(1);
            }
        });

    return deferred.promise;
};
