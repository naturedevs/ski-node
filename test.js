require('dotenv').config();

// Setup basic express server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.SOCKETIO_PORT || 21741;

var dbaction = require('./db_actions');
var Q = require('q');

server.listen(port, function () {
    console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(__dirname + '/public'));

// current running events
/*
    each event has the following status variables
    {
        id: <eventId>           // eventId from database
        info: {},               // from <info> command
        riders: [{}]            // from <riders> command
        horses: [{}]            // from <horses> command
        ranking: [{}]           // from <ranking> command
        startlist: []           // from <startlist> command
        realtime: {
            no, lane, startTime, score: { lane1: { time, timePenalty, point, pointPenalty }, lane2: { time, timePenalty, point, pointPenalty } }
        }                       // updated from <run> <timer1> <dnf> <final>
        finalNo:                // from <final> command
        running:                // set true from <run>, set false from <final>
        paused:                 // set from <run>
    }
 */
var events = [];

/*
    socket commands
    subscribe <roomId>,  roomId = provider | consumer | eventId
    unsubscribe <roomId>
    push { cmd: cmd, ... }

 */
io.on('connection', function (socket) {

    console.log("Connection......")
    socket.on('subscribe', function (room) {
        console.log("[on] subscribe: " + room);

        // send about the event
        if(room === "provider") {
            socket.join(room);
            console.log("joined to: " + room);
        } else if(room === "consumer") {
            socket.join(room);
            console.log("joined to: " + room);

            // send running events
            let eventInfos = events.map((event)=> {
                return { id: event.id, info: event.info };
            });
            console.log("[emit] socket:events" + JSON.stringify(eventInfos));
            socket.emit('events', eventInfos);

            // console.log("[emit] socket:push");
            // socket.emit("push", { cmd:"info", status:"success", data:{id: 0}});
        } else {
            // findout the event
            let event = events.find((event) => {
                return event.id == room;
            });

            if(event === undefined) {
                console.log("cannot find room");
                return ;
            }
            console.log("found event: " );
            if(socket.eventIdJoint === event.id) {
                console.log("already joined.");
                return ;
            }

            // leave from prev and join to new
            if(socket.eventIdJoint !== undefined) {
                console.log("leave from: " + socket.eventIdJoint);
                socket.leave(socket.eventIdJoint);
            }
            console.log("joined to: " + event.id);
            socket.join(event.id);
            socket.eventIdJoint = event.id;

            // send the information
            console.log("[emit] socket:info");
            socket.emit('info', event.info);

            console.log("[emit] socket:startlist");
            socket.emit('startlist', event.startlist);

            console.log("[emit] socket:horses");
            socket.emit('horses', event.horses);

            console.log("[emit] socket:riders");
            socket.emit('riders', event.riders);

            console.log("[emit] socket:ranking");
            socket.emit('ranking', event.ranking);

            if(event.realtime.num !== undefined) {
                console.log("[emit] socket:realtime(initial) " + JSON.stringify(event.realtime));
                socket.emit('realtime', event.realtime);

                if(event.running && event.paused == false) {
                    console.log("[emit] socket:resume ");
                    socket.emit('resume');
                } else {
                    // check whether current horse is finished
                    if(event.finalNo === event.realtime.num) {
                        console.log("[emit] socket:final ");
                        socket.emit('final')
                    } else {
                        console.log("[emit] socket:ready ");
                        socket.emit('ready');
                    }
                }
            }
        }
    });

    socket.on('unsubscribe', function (room) {
        console.log("[on] unsubscribe: " + room);

        roomId = '' + room;
        let rooms = Object.keys(socket.rooms);
        console.log("rooms=" + JSON.stringify(rooms));

        if (rooms.includes(roomId) === false) {
            console.error("cannot find room");
            return;
        }

        if(socket.eventIdJoint != room) {
            console.error("cannot unsubscribe from " + room);
            return;
        }

        console.log("unsubscribe from: " + room);
        socket.leave(room);
        socket.eventIdJoint = undefined;
    });

    socket.on('push', function (msg) {
        console.log("[on] push: ");

        // console.log("push: " + msg);
        // check if provider
        let rooms = Object.keys(socket.rooms);
        if (rooms.includes('provider') === false) {
            console.error("invalid push from client");
            return;
        }

        var obj = ((msg) => {
            try {
                return JSON.parse(msg);
            } catch (e) {
                return false;
            }
        })(msg);

        if (!obj || typeof obj.cmd === 'undefined') {
            console.error("invalid message");
            return;
        }
        console.log("push cmd=" + obj.cmd);

        if (obj.cmd === 'atstart') {
            processAtStart(obj);
        } else if (obj.cmd === 'final') {
            processFinal(obj);
        } else if (obj.cmd === 'run') {
            processRun(obj);
        // } else if (obj.cmd === 'sync') {
        //     processSync(obj);
        } else if (obj.cmd === 'timer1') {
            processTimer1(obj);
        } else if (obj.cmd === 'dnf') {
            processDNF(obj);
        } else if (obj.cmd === 'info') {
            processInfo(obj);
        } else if (obj.cmd === 'ready') {
            processReady(obj);
        } else if (obj.cmd === 'horses') {
            processHorses(obj);
        } else if (obj.cmd === 'riders') {
            processRiders(obj);
        } else if (obj.cmd === 'ranking') {
            processRanking(obj);
        } else if(obj.cmd === 'startlist') {
            processStartlist(obj);
        } else if(obj.cmd === 'exit') {
            processExit(obj);
        }
    });

    function getSocketEvent() {
        if(socket.eventId === 0) {
            console.error('invalid eventId');
            return false;
        }

        // find event
        let event = events.find((event) => {
            return event.id === socket.eventId;
        });

        if(event === undefined) {
            console.error('eventId not found in current list:' + socket.eventId);
            return false;
        }
        return event;
    }
    /////////***   command processors   ***////////////////////////////////////////

    // query and save to database and get eventId
    async function processInfo(command) {
        // command { title, eventTitle, startDate, endDate, eventDate }

		console.log("processInfo: " + JSON.stringify(command));

		try {
		    // find the event from event list
            let eventFound = events.find(function(event) {
                return (event.info.eventTitle === command.eventTitle) && (event.info.eventDate === command.eventDate);
            });

            let eventId = 0;

            if(eventFound === undefined) {
                // get event id from database
                eventId = await dbaction.findEvent(command.eventTitle, command.eventDate);

                if(eventId === 0) {
                    eventId = await dbaction.addEvent(command);
                }
            } else {
                eventId = eventFound.id;
            }

            socket.eventId = eventId;

            // add to the event list
            let event = getSocketEvent();

            if(event === false) {
                // initialize event
                event = { id: eventId, info: command, riders: [], horses: [], ranking: [], startlist: [], realtime: {}, finalNo: 0, running: false, paused: false, };
                events.push(event);
                console.log("new event pushed: ");

                // alarm to all client
                console.log("[emit] consumer:start " + JSON.stringify(event));
                socket.to("consumer").emit('start', event );
            } else {
                event.info = { ...event.info, ...command };
                console.log("update event: " + event.info.toString());
           }

            // alarm to client
            console.log("[emit] " + eventId + ":info " + JSON.stringify(event.info));
            socket.to(eventId).emit('info', event.info);

            // return result
            console.log("[emit] socket:push");
            socket.emit("push", { cmd:"info", status:"success", data:{id: eventId}});
            return eventId;
        } catch(error) {
            console.log("processInfo: failed" + JSON.stringify(error));
            return 0;
        }
    }

    // save to database
    async function processHorses(command) {
        console.log("processHorses started.");

        let event = getSocketEvent();
        if(event === false) {
            console.error("horses command: failed.");
            return ;
        }

        console.log("event found: id=" + event.id + ", info=" + JSON.stringify(event.info));

        // save to status
        event.horses = command.list;

        // alarm to client
        console.log("[emit] " + event.id + ":horses ");
        socket.to(event.id).emit('horses', event.horses);

        // save to database
        try {
            await dbaction.deleteHorses(event.id);

            let affected = 0;
            for(let horse of command.list) {
                var success = await dbaction.addHorse(event.id, horse);
                if(success == 1) {
                    affected++;
                }
            }

            console.log("horses command: inserted=" + affected);

        } catch(err) {
            console.log("horses command failed: " + JSON.stringify(err));
        }

        console.log("processHorses finished.");
    }

    async function processRiders(command) {
        console.log("processRiders started.");

        let event = getSocketEvent();
        if(event === false) {
            console.error("riders command: failed.");
            return ;
        }

        // save to status
        event.riders = command.list;

        // alarm to client
        console.log("[emit] " + event.id + ":riders " );
        socket.to(event.id).emit('riders', event.riders);

        // save to database
        try {
            await dbaction.deleteRiders(event.id);

            let affected = 0;
            for(let rider of command.list) {
                var success = await dbaction.addRider(event.id, rider);
                if(success == 1) {
                    affected++;
                }
            }
            console.log("riders command: inserted=" + affected);
        } catch(err) {
            console.log("riders command failed: " + JSON.stringify(err));
        }
        console.log("processRiders finished.");
    }

    async function processRanking(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("ranking command: failed.");
            return ;
        }

        // save to status
        event.ranking = [];
        for(let rank of command.list) {
            let entry = { num: rank.num, rank: rank.rank, score:
                    {   lane1: { time: rank.time1, timePenalty: rank.timePlus1, point: rank.point1, pointPenalty: rank.pointPlus1 },
                        lane2: { time: rank.time2, timePenalty: rank.timePlus2, point: rank.point2, pointPenalty: rank.pointPlus2 }
                    }
            };
            event.ranking.push(entry);
        }

        // alarm to client
        console.log("[emit] " + event.id + ":ranking ");
        socket.to(event.id).emit('ranking', event.ranking);

        // save to database
        try {
            // delete previouse data
            await dbaction.deleteRankings(event.id);

            let affected = 0;
            for(let rank of command.list) {
                var success = await dbaction.addRanking(event.id, rank);
                if(success == 1) {
                    affected++;
                }
            }
            console.log("ranking command: inserted=" + affected);
        } catch(err) {
            console.log("ranking command failed: " + JSON.stringify(err));
        }

        console.log("processRanking finished.");
    }

    async function processStartlist(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("ranking command: failed.");
            return ;
        }

        // save to status
        event.startlist = [];
        for(let startentry of command.list) {
            let entry = { ...startentry, score: {   lane1: { }, lane2: { } } };
            event.startlist.push(entry);
        }

        // alarm to client
        console.log("[emit] " + event.id + ":startlist ");
        socket.to(event.id).emit('startlist', event.startlist);

        // save to database
        try {
            // delete previouse data
            await dbaction.deleteStartLists(event.id);

            let affected = 0;
            for(let startlistentry of command.list) {
                var success = await dbaction.addStartList(event.id, startlistentry);
                if(success == 1) {
                    affected++;
                }
            }
            console.log("startlist command: inserted=" + affected);
        } catch(err) {
            console.log("startlist command failed: " + JSON.stringify(err));
        }


        console.log("processStartlist finished.");
    }

    function processReady(command)
    {
        // command { number, lane };
        let event = getSocketEvent();
        if(event === false) {
            console.error("run command: failed.");
            return ;
        }

        // initialize the real time
        event.realtime = { num: command.num, lane: command.lane, startTime: 0, score: { lane1: {}, lane2: {} } };

        console.log("[emit] " + event.id + ":realtime(ready) " + JSON.stringify(event.realtime));
        socket.to(event.id).emit('realtime', event.realtime);

        // alarm to client
        console.log("[emit] " + event.id + ":ready ");
        socket.to(event.id).emit('ready');
    }

    // update state
    function processRun(command) {
        // command { number, lane, point, time, startTime, pauseTime }

        let event = getSocketEvent();
        if(event === false) {
            console.error("run command: cannot find event.");
            return ;
        }

        if(event.realtime.num === undefined) {
            console.error("run command: there is no number.");
            return ;
        }

        // update status
        let updated = {};
        updated.num = command.num;
        updated.lane = command.lane;
        updated.startTime = command.startTime;
        updated.score = event.realtime.score;

        if(updated.lane === 1) {
            record = updated.score.lane1;
        } else {
            record = updated.score.lane2;
        }

        record.point = command.point;
        record.time = command.time;
        if(command.pauseTime !== 0) {
            record.time = command.pauseTime;
        }

        event.realtime = { ...event.realtime, ...updated };

        // alarm to client
        console.log("[emit] " + event.id + ":realtime(run) " + JSON.stringify(event.realtime));
        socket.to(event.id).emit('realtime', event.realtime);

        if(event.running === false) {
            event.running = true;
            console.log("[emit] " + event.id + ":resume ");
            socket.to(event.id).emit('resume');
        }

        // process pause
        if(command.pauseTime !== 0 && event.paused === false) {
            event.paused = true;
            console.log("[emit] " + event.id + ":pause ");
            socket.to(event.id).emit('pause', { finished: false });
        } else if(command.pauseTime === 0 && event.paused === true){
            event.paused = false;
            // start timer...
            console.log("[emit] " + event.id + ":resume ");
            socket.to(event.id).emit('resume');
        }
    }

    // function processSync(command) {
    //     // command.number;
    //     // command.lane;
    //     // command.time;
    //     // command.curTime;
    //
    //     let event = getSocketEvent();
    //     if(event === false) {
    //         console.error("run command: failed.");
    //         return ;
    //     }
    //
    //     // update status
    //     let updated = {};
    //     updated.num = command.num;
    //     updated.lane = command.lane;
    //     if(updated.lane === 1) {
    //         updated.time1 = command.time;
    //     } else {
    //         updated.time2 = command.time;
    //     }
    //
    //     event.realtime = { ...event.realtime, ...updated };
    //
    //     // alarm to client
    //     console.log("[emit] " + event.id + ":realtime(sync) " + JSON.stringify(event.realtime));
    //     socket.to(event.id).emit('realtime', event.realtime);
    // }

    function processTimer1(command) {
        // command.number;
        // command.lane;
        // command.time;
        // command.timePenalty;
        // command.point;
        // command.pointPenalty;

        let event = getSocketEvent();
        if(event === false) {
            console.error("run command: failed.");
            return ;
        }

        if(event.realtime.num === undefined) {
            console.error("run command: there is no number.");
            return ;
        }

        // update realtime status
        let updated = {};
        updated.num = command.num;
        updated.lane = command.lane;
        updated.score = event.realtime.score;

        let record;
        if(updated.lane === 1) {
            record = updated.score.lane1;
        } else {
            record = updated.score.lane2;
        }

        record.time = command.time + command.timePenalty;
        record.timePenalty = command.timePenalty;
        record.point = command.point + command.pointPenalty;
        record.pointPenalty = command.pointPenalty;

        event.realtime = { ...event.realtime, ...updated };

        // alarm to client
        console.log("[emit] " + event.id + ":realtime(final) " + JSON.stringify(event.realtime));
        socket.to(event.id).emit('realtime', event.realtime);

        console.log("[emit] " + event.id + ":final ");
        socket.to(event.id).emit('final');
    }

    function processFinal(command) {
        // command.number;
        // command.lane;
        // command.point;
        // command.time;

        let event = getSocketEvent();
        if(event === false) {
            console.error("run command: failed.");
            return ;
        }

        if(event.realtime.num === undefined) {
            console.error("run command: there is no number.");
            return ;
        }

        // update status
        let updated = {};
        updated.num = command.num;
        updated.lane = command.lane;
        updated.score = event.realtime.score;

        let record;
        if(updated.lane === 1) {
            record = updated.score.lane1;
        } else {
            record = updated.score.lane2;
        }
        record.time = command.time;
        record.point = command.point;

        event.realtime = { ...event.realtime, ...updated };

        // alarm to client
        console.log("[emit] " + event.id + ":realtime(final) " + JSON.stringify(event.realtime));
        socket.to(event.id).emit('realtime', event.realtime);

        console.log("[emit] " + event.id + ":pause ");
        socket.to(event.id).emit('pause', { finished: true });
        event.running = false;

        // check whether race is finished
        if(event.info.jumpoffNumber !== undefined) {
            if((event.info.jumpoffNumber > 0 && event.realtime.lane === 2) || event.info.jumpoffNumber === 0) {
                console.log("[emit] " + event.id + ":final ");
                socket.to(event.id).emit('final', event.realtime);
                event.finalNo = event.realtime.num;
            }
        }
    }

    function processDNF(command) {
        // command { no, code }
        let event = getSocketEvent();
        if(event === false) {
            console.error("run command: failed.");
            return ;
        }

        if(event.realtime.num === undefined) {
            console.error("run command: there is no number.");
            return ;
        }

        // update status
        let updated = {};
        updated.num = command.num;
        updated.lane = event.realtime.lane;
        updated.score = event.realtime.score;

        let record;
        if(updated.lane === 1) {
            record = updated.score.lane1;
        } else {
            record = updated.score.lane2;
        }
        record.point = -command.code;

        event.realtime = { ...event.realtime, ...updated };

        // alarm to client
        console.log("[emit] " + event.id + ":realtime(dnf) " + JSON.stringify(event.realtime));
        socket.to(event.id).emit('realtime', event.realtime);

        // paused
        console.log("[emit] " + event.id + ":pause ");
        socket.to(event.id).emit('pause', { finished: true });
        event.running = false;
    }

    function processAtStart(command) {
        // command.list
    }


    // when the user disconnects.. perform this
    function processExit(obj) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("run command: failed.");
            return ;
        }

        if (socket.eventId) {
            // remove from running events
            events = events.filter(event=>{ return event.id !== socket.eventId; });

            // alarm to clients
            console.log("[emit] consumer:end " + socket.eventId);
            socket.to('consumer').emit('end', { id: socket.eventId });
        }
    }
    // message processor


});
