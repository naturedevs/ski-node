
$(function () {
    var FADETIMOUT      = 2000;

    // running events
    var events = [];
    var curEvent = 0;

    // info of current event
    var startlist = []; // startlist
    var horses = {};    // indexed map
    var riders = {};    // indexed map
    var startlistmap = {};  // number indexed map
    var rankings = [];  // ranking list
    var realtime = {};  // live info


    var rolling_timer;
    var timer_running = false;

    var eventInfo = {}; // event.info

    // Prompt for setting a username
    var connected = false;
    var socket = io();

    socket.emit("subscribe", "consumer");
//

    //// messages to process
    //   socket.to('consumer').emit('start', { id: event.id} );
    //   socket.to('consumer').emit('end', { id: socket.eventId });
    //   socket.to(event.id).emit('info', event.info);
    //   socket.to(event.id).emit('horses', event.horses);
    //   socket.to(event.id).emit('riders', event.riders);
    //   socket.to(event.id).emit('startlist', event.startlist);
    //   socket.to(event.id).emit('ranking', event.ranking);
    //   socket.to(event.id).emit('ready', event.realtime);
    //   socket.to(event.id).emit('resume');
    //   socket.to(event.id).emit('realtime', event.realtime);
    //   socket.to(event.id).emit('pause');
    //   socket.to(event.id).emit('final', event.realtime);

    // Socket events

    // get the current running events information
    socket.on("events", function(data) {
        console.log("[on] events:" + JSON.stringify(data));
        events = data;
        updateEventList();
    });

    // add new event started
    socket.on("start", function (data) {
        console.log("[on] start:" + JSON.stringify(data));
        events.push(data);
        updateEventList();
    });

    // an event is ended
    socket.on("end", function (data) {
        console.log("[on] end:" + JSON.stringify(data));

        // stop timer
        clearInterval(rolling_timer);
        timer_running = false;
        setRuntimeList(true);

        events = events.filter((event) => {
            return event.id !== data;
        });

        $('#error_finishevent').show();

        updateEventList();
    });

    // update event info
    socket.on("info", function (data) {
        console.log("[on] info:" + JSON.stringify(data));

        // set eventInfo
        eventInfo = data;

        // update UI
        $('#meeting-title').text(data.title);
        $('#event-title').text(data.eventTitle);

        $('#event-date').text(formatDate(data.eventDate));

        // update headercolumns according to the race type
        updateTableHeaderColumns();
    });

    // update horse info
    socket.on('horses', function (data) {
        console.log("[on] horses:" + data.length/* + JSON.stringify(data) */);
        horses = {};
        for (let horse of data) {
            horses[horse.idx] = horse;
        }

        // update UI
        updateLiveRankingList();
        updateRankingList();
        updateStartList();
    });

    // update rider info
    socket.on('riders', function (data) {
        console.log("[on] riders:" + data.length/* + JSON.stringify(data) */);
        riders = {};
        for (let rider of data) {
            riders[rider.idx] = rider;
        }

        // update UI
        updateLiveRankingList();
        updateRankingList();
        updateStartList();
    });

    // update startlist
    socket.on('startlist', function (data) {
        console.log("[on] startlist:" + data.length/* + JSON.stringify(data) */);
        startlist = data;

        startlistmap = {};
        for (let startlistentry of data) {
            startlistmap[startlistentry.num] = startlistentry;
        }

        // updateUI
        updateStartList();
    });

    // update ranking info
    socket.on('ranking', function (data) {
        console.log("[on] ranking:" + data.length/* + JSON.stringify(data) */);

        // resort by ranking
        data.sort((a, b) => {
            return a.rank - b.rank;
        });

        rankings = data;
        for (let i = 0 ; i < rankings.length ; i++) {
            let num = rankings[i].num;
            let startlistentry = startlistmap[num];
            if(startlistentry !== undefined) {
                rankings[i].horse_idx = startlistentry.horse_idx;
                rankings[i].rider_idx = startlistentry.rider_idx;
            }
        }

        // Update UI
        updateLiveRankingList();
        updateRankingList();
    });

    // one ready to race
    socket.on('ready', function(data) {
        console.log("[on] ready:");
        // find position
        let startlistentry = startlistmap[realtime.num];

        // update atstart and atend
        if(startlistentry !== undefined) {
            updateLiveAtStart(startlistentry['pos'] + 1);
            updateLiveAtFinish(startlistentry['pos'] - 1);
        }

        // init realtime and update
        setRuntimeList(true);
    });

    // get live race info
    socket.on('realtime', function (data) {
        console.log("[on] realtime:" + JSON.stringify(data));
        realtime = data;

        realtime.updateTick = Date.now();
        // update except time
        setRuntimeList(false);

        if(timer_running == false) {
            let curTime;
            if(realtime.lane === 1) {
                curTime = realtime.score.lane1.time;
            } else {
                curTime = realtime.score.lane2.time;
            }
            updateRuntimeTimer(realtime.lane, curTime);
        }
    });

    // racing is started (every round)
    socket.on('resume', function (data) {
        console.log("[on] resume");

        // find position
        let startlistentry = startlistmap[realtime.num];

        // update atstart and atend
        if(startlistentry !== undefined) {
            updateLiveAtStart(startlistentry['pos'] + 1);
            updateLiveAtFinish(startlistentry['pos'] - 1);
        }

        // start rolling timer
        if(timer_running) {
            console.log("timer already running");
        } else {
            let started = 0, tickFrom = Date.now();
            if(realtime.lane === 1) {
                started = realtime.score.lane1.time;
            } else {
                started = realtime.score.lane2.time;
            }

            rolling_timer = setInterval(function() {
                if(Date.now() - tickFrom > 2000) {
                    tickFrom = realtime.updateTick;
                    if(realtime.lane === 1) {
                        started = realtime.score.lane1.time;
                    } else {
                        started = realtime.score.lane2.time;
                    }
                    console.log('timer synced: tickFrom=' + tickFrom + ", started=" + started);
                }
                updateRuntimeTimer(realtime.lane, started + (Date.now() - tickFrom));
            }, 100);
            timer_running = true;
        }
    });

    // racing is paused (every round)
    socket.on('pause', function (data) {
        console.log("[on] pause");

        // stop rolling timer
        clearInterval(rolling_timer);
        timer_running = false;

        // full update
        if(data.finished === true) {
            setRuntimeList(true);
        } else {
            let started;
            if(realtime.lane === 1) {
                started = realtime.score.lane1.time;
            } else {
                started = realtime.score.lane2.time;
            }
            updateRuntimeTimer(realtime.lane, started);
        }
    });

    // one player finished
    socket.on('final', function (data) {
        console.log("[on] final:" + JSON.stringify(data));

        // find position
        let startlistentry = startlistmap[realtime.num];

        // update atstart and atend
        if(startlistentry !== undefined) {
            updateLiveAtStart(startlistentry['pos'] + 1);
            updateLiveAtFinish(startlistentry['pos']);
        }

        // update runtime with ranking
        let ranking = rankings.find(function(ranking) {
            return ranking.num === realtime.num;
        });
        if(ranking !== undefined) {
            realtime.rank = ranking.rank;
        }
        setRuntimeList(true);
    });

    socket.on('disconnect', function () {
        console.log('you have been disconnected');
    });

    socket.on('reconnect', function () {
        console.log('you have been reconnected');
        events = [];

        socket.emit("subscribe", "consumer");
    });

    socket.on('reconnect_error', function () {
        console.log('attempt to reconnect has failed');
    });


    ///////////////////////////////////////////////////
    // UI management function

    function formatFloat(point, digit, round) {
        digit = (digit > 5)?5:digit;
        digit = (digit < 0)?0:digit;

        let pos = Math.pow(10, digit);
        if(round==='round') {
            point = Math.round(point * pos);
        } else if(round ==='ceil') {
            point = Math.ceil(point * pos);
        } else if(round==='floor') {
            point = Math.floor(point * pos);
        }
        return (point / pos).toFixed(digit);
    }

    function formatPoint(score, detail) {
        if(score.point === undefined)
            return "&nbsp";

        let labels = ["Classified", "Not Present", "Not Started", "Retired", "Eliminated", "Off-course", "Disqualified"];
        if(score.point === undefined)
            return "&nbsp";

        if(score.point < 0) {
            let index = Math.abs(score.point) - 1;
            if(index > 0 && index <= 6) {
                return labels[index];
            }
        }

        let label = formatFloat(score.point / 1000, 2, 'floor');
        if(detail && (score.pointPenalty !== undefined && score.pointPenalty != 0)) {
            label += "(+" + formatFloat(score.pointPenalty / 1000, 2, 'floor') + ")";
        }
        return label;
    }

    function formatTime(score, detail) {
        if(score.time === undefined)
            return "&nbsp";

        let label = formatFloat(Math.abs(score.time) / 1000, 2, 'floor');
        if(detail && (score.timePenalty !== undefined && score.timePenalty != 0)) {
            label += "(+" + formatFloat(Math.abs(score.timePenalty) / 1000, 2, 'floor') + ")";
        }
        return label;
    }

    function formatDate(dateString) {
        var d = new Date(dateString);

        return ("0" + d.getDate()).slice(-2) + "." + ("0"+(d.getMonth()+1)).slice(-2) + "." + d.getFullYear();
    }

    function updateTableHeaderColumns() {
        // change header
        let headers = $(".table-scoreboard thead tr");

         if(eventInfo.jumpoffNumber > 0) {
             headers.children("th:nth-child(6)").removeClass("col-2").addClass("col-1").addClass("small-font");
             headers.children("th:nth-child(7)").removeClass("col-2").addClass("col-1").addClass("small-font");
             headers.children("th:nth-child(8)").removeClass("col-2").addClass("col-1").css("display", "inline-block").addClass("small-font");
             headers.children("th:nth-child(9)").removeClass("col-2").addClass("col-1").css("display", "inline-block").addClass("small-font");
         } else {
             headers.children("th:nth-child(6)").removeClass("col-1").addClass("col-2").removeClass("small-font");
             headers.children("th:nth-child(7)").removeClass("col-1").addClass("col-2").removeClass("small-font");
             headers.children("th:nth-child(8)").css("display", "none").removeClass("small-font");
             headers.children("th:nth-child(9)").css("display", "none").removeClass("small-font");
         }

        // realtime
        var tr = $('#live-realtime tr:first');

        if(eventInfo.jumpoffNumber > 0) {
            tr.children("td:nth-child(6)").removeClass("col-2").addClass("col-1");
            tr.children("td:nth-child(7)").removeClass("col-2").addClass("col-1");
            tr.children("td:nth-child(8)").removeClass("col-2").addClass("col-1").css("display", "inline-block");
            tr.children("td:nth-child(9)").removeClass("col-2").addClass("col-1").css("display", "inline-block");
        } else {
            tr.children("td:nth-child(6)").removeClass("col-1").addClass("col-2");
            tr.children("td:nth-child(7)").removeClass("col-1").addClass("col-2");
            tr.children("td:nth-child(8)").css("display", "none");
            tr.children("td:nth-child(9)").css("display", "none");
        }
    }

    //  fill the list from index to the atstart list
    function updateLiveAtStart(index) {
        clearRanking("live-atstart");

        let limit = (index + 3 < startlist.length)?(index + 3):startlist.length;

        var row = 1;
        // load ranking data
        for(i = limit - 1 ; i >= index ; i--) {
            startlist[i].rank = i + 1; // it is pos value
            addToRankingList("live-atstart", row++, startlist[i]);
        }
        // clearRankingRemains("live-atstart", row);
    }

    // fill the rank from index to the atstart list
    function updateLiveAtFinish(index) {
        clearRanking("live-atfinish");

        let limit = (index - 3 >= 0)?(index - 3):-1;

        var row = 1;

        // load ranking data
        for(let i = index ; i > limit ; i--) {
            let num = startlist[i].num;

            let ranking = rankings.find(function(ranking) {
                return ranking.num === num;
            });

            if(ranking === undefined) {
                // add empty ranking
                ranking = { num: num, score: { lane1: {}, lane2: {} }};
            }
            addToRankingList("live-atfinish", row++, ranking);
        }
        // clearRankingRemains("live-atfinish", row);
    }

    function updateLiveRankingList() {
        clearRanking("live-ranking");
        var index = 1;
        for (let ranking of rankings) {
            addToRankingList("live-ranking", index++, ranking);
        }
        // clearRankingRemains("live-ranking", index);
    }

    function updateRuntimeTimer(lane, value)
    {
        let label = formatFloat(Math.abs(value) / 1000, 1, 'floor');
        var tr = $('#live-realtime tr');
        if(lane === 1) {
            tr.children("td:nth-child(7)").html(label);
        } else {
            tr.children("td:nth-child(9)").html(label);
        }
    }

    function setRuntimeList(fullupdate) {
        var tr = $('#live-realtime tr');

        // clear content
        if (realtime.num == 0 || startlistmap[realtime.num] === undefined) {
            clearRuntimeList();
            return;
        }
        let startlistentry = startlistmap[realtime.num];

        tr.children("td:nth-child(1)").html((realtime.rank===undefined)?"&nbsp":realtime.rank + ".");
        tr.children("td:nth-child(2)").html(realtime.num);
        tr.children("td:nth-child(6)").html(formatPoint(realtime.score.lane1, false));
        tr.children("td:nth-child(8)").html(formatPoint(realtime.score.lane2, false));
        if(fullupdate === true) {
            tr.children("td:nth-child(7)").html(formatTime(realtime.score.lane1, false));
            tr.children("td:nth-child(9)").html(formatTime(realtime.score.lane2, false));
        }

        var horse = horses[startlistentry.horse_idx];
        if (horse !== undefined) {
            tr.children("td:nth-child(3)").html(horse.name);
        } else {
            tr.children("td:nth-child(3)").html("&nbsp");
        }

        var rider = riders[startlistentry.rider_idx];
        if (rider !== undefined) {
            tr.children("td:nth-child(4)").html(rider.lastName + "&nbsp" + rider.firstName);
            tr.children("td:nth-child(5)").css("background", "#232323 url('flags/" + rider.nation + ".bmp') center no-repeat").css("background-size", "contain");
            tr.children("td:nth-child(5)").attr("data-toggle", "tooltip").attr("title", rider.nation);
        } else {
            tr.children("td:nth-child(4)").html("&nbsp");
            tr.children("td:nth-child(5)").html("&nbsp");
        }
    }

    function clearRuntimeList() {
        var tds = $('#live-realtime tr td');
        tds.html("&nbsp");
    }

    function updateStartList()
    {
        clearRanking("startlist");

        var index = 1;
        for (let i = 0 ; i < startlist.length ; i++) {
            startlist[i].rank = i + 1; // it is pos value

            let num = startlist[i].num;

            let ranking = rankings.find(function(ranking) {
                return ranking.num === num;
            });
            if(ranking !== undefined) {
                // add empty ranking
                startlist[i].score = ranking.score;
            } else {
                startlist[i].score = { lane1: {}, lane2: {} };
            }

            addToRankingList("startlist", index++, startlist[i]);
        }
        // clearRankingRemains("startlist", index);
    }

    function updateRankingList() {
        clearRanking("ranking");

        var index = 1;
        for (let ranking of rankings) {
            addToRankingList("ranking", index++, ranking);
        }
        // clearRankingRemains("ranking", index);
    }

    function addToRankingList(tableId, i, ranking) {
        var tr = $('#' + tableId + ' tr:nth-child(' + i + ')');

        let startlistentry = startlistmap[ranking.num];

        if (tr.length == 0) {
            $('#' + tableId).append($('<tr>'));
            tr = $('#' + tableId + ' tr:last');
            tr.append($('<td>').addClass("col-1 center").html("&nbsp"));
            tr.append($('<td>').addClass("col-1 center").html("&nbsp"));
            tr.append($('<td>').addClass("col-2 left").html("&nbsp"));
            tr.append($('<td>').addClass("col-3 left").html("&nbsp"));
            tr.append($('<td>').addClass("col-1 flag").html("&nbsp"));

            if(eventInfo.jumpoffNumber > 0) {
                tr.append($('<td>').addClass("col-1 right").html("&nbsp"));
                tr.append($('<td>').addClass("col-1 right").html("&nbsp"));
                tr.append($('<td>').addClass("col-1 right").html("&nbsp"));
                tr.append($('<td>').addClass("col-1 right").html("&nbsp"));
            } else {
                tr.append($('<td>').addClass("col-2 right").html("&nbsp"));
                tr.append($('<td>').addClass("col-2 right").html("&nbsp"));
            }
        }

        tr.children("td:nth-child(1)").html((ranking.rank===undefined)?"&nbsp":(ranking.rank + "."));
        tr.children("td:nth-child(2)").html(ranking.num);

        tr.children("td:nth-child(6)").html(formatPoint(ranking.score.lane1, true));
        tr.children("td:nth-child(7)").html(formatTime(ranking.score.lane1, true));

        if(eventInfo.jumpoffNumber > 0) {
            tr.children("td:nth-child(8)").html(formatPoint(ranking.score.lane2, true));
            tr.children("td:nth-child(9)").html(formatTime(ranking.score.lane2, true));
        }

        let horse = undefined;
        if(startlistentry !== undefined) {
            horse = horses[startlistentry.horse_idx];
        }
        if (horse !== undefined) {
            tr.children("td:nth-child(3)").html(horse.name);
        } else {
            tr.children("td:nth-child(3)").html("&nbsp");
        }

        let rider = undefined;
        if(startlistentry !== undefined) {
            rider = riders[startlistentry.rider_idx];
        }
        if (rider !== undefined) {
            tr.children("td:nth-child(4)").html(rider.lastName + "&nbsp" + rider.firstName);
            tr.children("td:nth-child(5)").css("background", "#232323 url('flags/" + rider.nation + ".bmp') center no-repeat").css("background-size", "contain");
            tr.children("td:nth-child(5)").attr("data-toggle", "tooltip").attr("title", rider.nation);
        } else {
            tr.children("td:nth-child(4)").html("&nbsp");
            tr.children("td:nth-child(5)").html("&nbsp");
        }

        tr.children().each(function () {
            if(this.scrollWidth > $(this).outerWidth()) {
                $(this).addClass("small-font");
            } else {
                $(this).removeClass("small-font");
            }
        });
    }

    function clearRanking(tableId) {
        $('#' + tableId).html("");
    }

    function clearRankingRemains(tableId, count) {
        while (1) {
            var tr = $('#' + tableId + ' tr:nth-child(' + count + ')');
            if (tr.length == 0)
                break;

            tr.remove();
        }
    }

    function updateEventList() {
        $('#live-events').html('');

        for(event of events) {
            $('#live-events').append($('<tr>'));
            tr = $('#live-events tr:last');
            tr.append($('<td>').addClass("col-4 left").html("&nbsp"));
            tr.append($('<td>').addClass("col-4 left").html("&nbsp"));
            tr.append($('<td>').addClass("col-2 center").html("&nbsp"));
            tr.append($('<td>').addClass("col-2 center").html("&nbsp"));

            tr.children("td:nth-child(1)").html(event.info.title);
            tr.children("td:nth-child(2)").html(event.info.eventTitle);
            tr.children("td:nth-child(3)").html(formatDate(event.info.startDate));
            tr.children("td:nth-child(4)").html(formatDate(event.info.endDate));

            tr.attr("data-ref", event.id);

            tr.click(function() {
                evendId = $(this).attr("data-ref");
                joinToEvent(evendId);
            });
        }
    }

    function joinToEvent(eventId) {
        let event = events.find( (event) => {
            return (event.id == eventId);
        });

        if(event === undefined) {
            $("#error_noevent").show();
            return ;
        }

        $("#error_noevent").hide();
        $("#error_finishevent").hide();

        socket.emit("subscribe", eventId);
        curEvent = eventId;

        $('#event_list').hide();
        $('#event_view').show();
    }

    // goto event list
    $("#goto-events").click(function () {
        socket.emit('unsubscribe', curEvent);

        clearInterval(rolling_timer);
        timer_running = false;

        $('#error_finishevent').hide();

        $('#event_list').show();
        $('#event_view').hide();
    });

    $('#event_view').hide();
    $('#event_list').show();
});

$(".nav .nav-link").click(function() {
    $(this).parents("ul").find("div.nav-link").removeClass("active");
    $(this).addClass("active");

    var menu_id = $(this).attr("id");

    $("section#sec-live").css("display", "none");
    $("section#sec-startlist").css("display", "none");
    $("section#sec-ranking").css("display", "none");

    if(menu_id == "nav-live") {
        $("section#sec-live").css("display", "block");
    } else if(menu_id == "nav-startlist") {
        $("section#sec-startlist").css("display", "block");
    } else if(menu_id == "nav-ranking") {
        $("section#sec-ranking").css("display", "block");
    }
});


