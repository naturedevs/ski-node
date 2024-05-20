require('dotenv').config();

// Setup basic express server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.SOCKETIO_PORT || 21742;

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

            socket.emit('players', event.players);

            /*
            console.log("[emit] socket:startlist");
            socket.emit('startlist', event.startlist);

            console.log("[emit] socket:horses");
            socket.emit('horses', event.horses);

            console.log("[emit] socket:riders");
            socket.emit('riders', event.riders);

            console.log("[emit] socket:ranking");
            socket.emit('ranking', event.ranking);
            */

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
        //console.log("[on] push: ");

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
        //console.log("push cmd=" + obj.cmd);

        if (obj.cmd === 'NR') {
            processNR(obj);
        } else if (obj.cmd === 'IR') {
            processIR(obj);        
        } else if (obj.cmd === 'ER') {
            processER(obj);        
        } else if (obj.cmd === 'I') {
            processI(obj);        
        } else if (obj.cmd === 'S') {
            processS(obj);
        } else if (obj.cmd === 'run') {
            processRun(obj);
        } else if (obj.cmd === 'SYNC') {
            processSYNC(obj);
        } else if (obj.cmd === 'R') {
            processR(obj);
        } else if (obj.cmd === 'info') {
            processInfo(obj);
        } else if (obj.cmd == "playerlist") {
            processPlayerList(obj);
        } else if (obj.cmd === 'F') {
            processF(obj);
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
                return (event.info.eventTitle === command.eventTitle) && (event.info.event_date === command.event_date);
            });

            let eventId = 0;

            if(eventFound === undefined) {
                // get event id from database
                //eventId = await dbaction.findEvent(command.eventTitle, command.eventDate);
                eventId = Date.now();
                //if(eventId === 0) {
                //    eventId = await dbaction.addEvent(command);
                //}
            } else {
                eventId = eventFound.id;
            }
            

            //let eventId = 1;
            socket.eventId = eventId;

            // add to the event list
            let event = getSocketEvent();

            if(event === false) {
                // initialize event
                event = { id: eventId, info: command, players: {}, };
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

    async function processPlayerList(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("playerlist command: failed.");
            return ;
        }

        console.log("*** player list packet");

        event.players = {};

        for(let item of command.list) {

            let gender = "";

            if (item.gender == 1)
                gender = "Men";
            else if(item.gender == 2)
                gender = "Women";

            let player = {
                num:        item.num,
                lastname:   item.lastname,
                firstname:  item.firstname,
                code:       item.code,
                nat_code:   item.nat_code,
                year:       item.year,
                category:   item.category,
                nation:     item.nation,
                club:       item.club,
                team:       item.team,
                gender:     gender,
                reg_start_time: item.reg_start_time,
                sections:   {},
            };


            event.players[player.num] = player;
        }

        //console.log(event.players);

        socket.to(event.id).emit('players', event.players);
    }

    async function processNR(command) {
        let event = getSocketEvent();
        if(event === false || command.num == 0) {
            console.error("NR command: failed.");
            return ;
        }

        console.log("*** NR packet");

        let player = event.players[command.num];

        if (player == undefined) {
            player = {
                num: command.num,
                sections: {}
            };
            event.players[command.num.toString()] = player;
        }

        let section = player.sections[command.section];
        if (section == undefined) {
            section = {};
            player.sections[command.section] = section;
        }

        section.start_time = Math.floor(command.start_time / 1000);

        //console.log(event.players);

        //socket.to(event.id).emit('players', event.players);
    }

    async function processIR(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("IR command: failed.");
            return ;
        }

        console.log("*** IR packet");
    }

    async function processER(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("ER command: failed.");
            return ;
        }

        console.log("*** ER packet");

        socket.to(event.id).emit('players', event.players);
    }

    async function processI(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("I command: failed.");
            return ;
        }

        console.log("*** I packet");

        let player = event.players[command.num];

        if (player == undefined) {
            player = {};
            event.players[command.num.toString()] = player;
        }

        player.num = command.num;
        player.status = command.status; // 0: normal, 1: DNS, 2: DNF, 3: DSQ, 15: NPS


        for(let section_data of command.list) {
            
            let section = player.sections[section_data.section];

            if (section == undefined)
                section = {};

            section.elapsed_time = section_data.elapsed_time;

            player.sections[section_data.section] = section;
        }


        //console.log(event.players);

        socket.to(event.id).emit('players', event.players);
    }

    async function processS(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("S command: failed.");
            return ;
        }

        console.log("*** S packet");

        let sec_num = command.section;

        for(let section_data of command.list) {
            
            let num = section_data.num;

            let player = event.players[num];

            if (player != undefined) {
                player.running_section = sec_num;
            }
        }


        //console.log(event.players);

        socket.to(event.id).emit('players', event.players);
    }

    async function processR(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("R command: failed.");
            return ;
        }

        console.log("*** R packet");

        for(let item of command.list) {
            let player = event.players[item.num];

            if (player != undefined) {
                player.current_time = item.current_time;
            }
        }

        //console.log(event.players);

        socket.to(event.id).emit('players', event.players);
    }

    async function processF(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("F command: failed.");
            return ;
        }

        console.log("*** F packet");

        for(let item of command.list) {
            let player = event.players[item.num];

            if (player != undefined) {
                player.finish_time = item.finish_time;
                player.running_section = event.info.inter_number + 2;
            }
        }

        //console.log(event.players);

        socket.to(event.id).emit('players', event.players);
    }

    async function processSYNC(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("SYNC command: failed.");
            return ;
        }

        //console.log("*** SYNC packet");

        socket.to(event.id).emit('sync', command.sync_time);
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
