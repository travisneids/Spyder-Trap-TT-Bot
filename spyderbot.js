/**
 *  spyderbot.js
 *  Author: Travis Neiderhiser
 *  Version: [dev] 2012.01.13
 *  
 *  Original script created by sharedferret https://github.com/sharedferret/Sparkle-Turntable-Bot - great work!  
 *  This is a version made specifically for the Spyder Trap room.
 *  Based on bot implementations by alaingilbert, anamorphism, and heatvision
 *  Uses node.js with modules ttapi, node_mysql, request
 * 
 *  
 *  Make sure parameters in config.js are set before running.
 *  Make sure a mysql server instance is running before starting the bot.
 *
*/
var Bot;
var config;
var mysql;
var client;
var request;

//Creates the bot listener
try {
	Bot = require('ttapi');
} catch(e) {
	console.log(e);
	console.log('It is likely that you do not have the ttapi node module installed.'
		+ '\nUse the command \'npm install ttapi\' to install.');
	process.exit(0);
}

//Creates the config object
try {
	config = require('./config.js');
} catch(e) {
	console.log(e);
	console.log('Ensure that config.js is present in this directory.');
	process.exit(0);
}

//Creates mysql db object
try {
	mysql = require('mysql');
} catch(e) {
	console.log(e);
	console.log('It is likely that you do not have the mysql node module installed.'
		+ '\nUse the command \'npm install mysql\' to install.');
	process.exit(0);
}

//Connects to mysql server
try {
	client = mysql.createClient(config.DBLOGIN);
} catch(e) {
	console.log(e);
	console.log('Make sure that a mysql server instance is running and that the '
		+ 'username and password information in config.js are correct.');
}

//Initializes request module
try {
	request = require('request');
} catch(e) {
	console.log(e);
	console.log('It is likely that you do not have the request node module installed.'
		+ '\nUse the command \'npm install request\' to install.');
	process.exit(0);
}

//Creates the bot and initializes global vars
var bot = new Bot(config.AUTH, config.USERID);
var usersList = { };

//Used for room enforcement
var djs = { };
var usertostep;
var userstepped = false;
var djsCount;

//Used for bonus awesoming
var bonuspoints = new Array();

//Current song info
var currentsong = {
	artist: null,
	song: null,
	djname: null,
	djid: null,
	up: 0,
	down: 0,
	listeners: 0,
	songid: null};

//Checks if the user id is present in the admin list. Authentication
//for admin-only privileges.
function admincheck(userid) {
	for (i in config.admins) {
		if (userid == config.admins[i]) {
			return true;
		}
	}
	return false;
}
//Checks number of DJS
function checkDjCount() {
	djsCount = 0;
	for(i in djs) {
		djsCount++;
	}
	return djsCount;
}
//AutoDJ Function
var manualDj = false;
function autoDj() {
	//Told to DJ?
	if(manualDj == false) {
		//Only DJ if there isn't enough DJs
		if(checkDjCount() < 2) {
			bot.addDj();
		} else if(checkDjCount() > 2){
			bot.remDj();
		}
	}
}
//Adds the song data to the songdata table.
//This runs on the endsong event.
function addToDb(data) {
	client.query(
		'INSERT INTO '+ config.SONG_TABLE +' '
		+ 'SET artist = ?,song = ?, djname = ?, djid = ?, up = ?, down = ?,'
		+ 'listeners = ?, started = ?, songid = ?',
		[currentsong.artist, 
		currentsong.song, 
		currentsong.djname, 
		currentsong.djid, 
		currentsong.up, 
		currentsong.down, 
		currentsong.listeners, 
		new Date(),
		currentsong.songid]);
}

function getTarget() {
	if (currentsong.listeners < 10) {
		return 3;
	} else if (currentsong.listeners < 20) {
		return 4;
	}
	return 5 + Math.floor((currentsong.listeners - 20) / 20);
}

//When the bot is ready, this makes it join the primary room (ROOMID)
//and sets up the database/tables
//TODO: Actually handle those errors (99% of the time it'll be a "db/table
//	already exists" error which is why I didn't handle them immediately)
bot.on('ready', function (data) {

	//Creates DB and tables if needed, connects to db
	client.query('CREATE DATABASE ' + config.DATABASE,
		function(error) {
			if(error && error.number != mysql.ERROR_DB_CREATE_EXISTS) {
				throw (error);
			}
		});
	client.query('USE '+ config.DATABASE);

	//song table
	client.query('CREATE TABLE ' + config.SONG_TABLE
		+ '(id INT(11) AUTO_INCREMENT PRIMARY KEY,'
		+ ' artist VARCHAR(255),'
		+ ' song VARCHAR(255),'
		+ ' djname VARCHAR(255),'
		+ ' djid VARCHAR(255),'
		+ ' up INT(3),' + ' down INT(3),'
		+ ' listeners INT(3),'
		+ ' started DATETIME)',
		
		function (error) {
			//Handle an error if it's not a table already exists error
			if(error && error.number != 1050) {
				throw (error);
			}
		});

	//chat table
	client.query('CREATE TABLE ' + config.CHAT_TABLE
		+ '(id INT(11) AUTO_INCREMENT PRIMARY KEY,'
		+ ' user VARCHAR(255),'
		+ ' userid VARCHAR(255),'
		+ ' chat VARCHAR(255),'
		+ ' time DATETIME)',
		function (error) {
			//Handle an error if it's not a table already exists error
			if(error && error.number != 1050) {
				throw (error);
			}
		});
	bot.roomRegister(config.ROOMID);
});

//Runs when the room is changed.
//Updates the currentsong array and users array with new room data.
bot.on('roomChanged', function(data) {
	//Fill currentsong array with room data
	if (data.room.metadata.current_song != null) {
		currentsong.artist    = data.room.metadata.current_song.metadata.artist;
		currentsong.song      = data.room.metadata.current_song.metadata.song;
		currentsong.djname    = data.room.metadata.current_song.djname;
		currentsong.djid      = data.room.metadata.current_song.djid;
		currentsong.up        = data.room.metadata.upvotes;
		currentsong.down      = data.room.metadata.downvotes;
		currentsong.listeners = data.room.metadata.listeners;
	}

	//Creates the dj list
	djs = data.room.metadata.djs;
	
	//Repopulates usersList array.
	var users = data.users;
	for (i in users) {
		var user = users[i];
		usersList[user.userid] = user;
	}
});

//Runs when a user updates their vote
//Updates current song data and logs vote in console
bot.on('update_votes', function (data) {
	//Update vote and listener count
	currentsong.up = data.room.metadata.upvotes;
	currentsong.down = data.room.metadata.downvotes;
	currentsong.listeners = data.room.metadata.listeners;
	
	//Assign bonus point if room vote > 75% if room populated
	//if ((currentsong.listeners > 10) && (((currentsong.up * .5)
	//	+ (currentsong.down * .5) / currentsong.listeners) > 0.75) {
	//	bot.speak('Bonus!');
	//	bot.vote('up');
	//}

	//Log vote in console
	//Note: Username only displayed for upvotes, since TT doesn't broadcast
	//      username for downvote events.
	if (config.logConsoleEvents) {
		if (data.room.metadata.votelog[0][1] == 'up') {
			var voteduser = usersList[data.room.metadata.votelog[0][0]];
				console.log('Vote: [+'
				+ data.room.metadata.upvotes + ' -'
				+ data.room.metadata.downvotes + '] ['
				+ data.room.metadata.votelog[0][0] + '] '
				+ voteduser.name + ': '
				+ data.room.metadata.votelog[0][1]);
		} else {
			console.log('Vote: [+'
				+ data.room.metadata.upvotes + ' -'
				+ data.room.metadata.downvotes + ']');
		}
	}
});

//Runs when a user joins
//Adds user to userlist, logs in console, and greets user in chat.
bot.on('registered',   function (data) {
	//Log event in console
	if (config.logConsoleEvents) {
		console.log('Joined room: ' + data.user[0].name);
	}
	
	//Add user to usersList
	var user = data.user[0];
	usersList[user.userid] = user;

	//Greet user
	//Displays custom greetings for certain members
	if(config.welcomeUsers) {
		if (!user.name.match(/^ttdashboard/)) {
			bot.speak('Welcome, ' + user.name + '!');
		}
	}
});

//Runs when a user leaves the room
//Removes user from usersList, logs in console
bot.on('deregistered', function (data) {
	//Log in console
	if (config.logConsoleEvents) {
		console.log('Left room: ' + data.user[0].name);
	}
	
	//Remove user from userlist
	delete usersList[data.user[0].userid];
});

//Runs when something is said in chat
//Responds based on coded commands, logs in console, adds chat entry to chatlog table
//Commands are added under switch(text)
bot.on('speak', function (data) {
	//Get name/text data
	var name = data.name;
	var text = data.text;

	//Log in console
	if (config.logConsoleEvents) {
		console.log('Chat ['+data.userid+' ' +name+'] '+text);
	}

	//Log in db (chatlog table)
	client.query('INSERT INTO ' + config.CHAT_TABLE + ' '
		+ 'SET user = ?, userid = ?, chat = ?, time = ?',
		[data.name, data.userid, data.text, new Date()]);

	//If it's a supported command, handle it	
	switch(text) {
		//--------------------------------------
		//COMMAND LISTS
		//--------------------------------------

		case 'help':
		case 'commands':
			bot.speak('commands: ping, facebook, '
				+ 'twitter, rules, users, owner, source, mostplayed, '
				+ 'mostawesomed, mymostplayed, mymostawesomed, '
				+ 'pastnames [username], similar, similarartists');
			break;

		//Bonus points
		case 'vrbboom':
			bot.speak('Bot love Jeff!  Bot add point for love of Jeff.');
		case 'stboom':
		case 'bonus':
		case 'good dong':
		case 'awesome':
		case 'good song':
		case 'great song':
		case 'nice pick':
		case 'good pick':
		case 'great pick':
		case 'dance':
		case '/dance':
		case 'tromboner':
			if (bonuspoints.indexOf(data.name) == -1) {
				bonuspoints.push(data.name);

				//Target number.
				//3 needed if less than 10 users.
				//4 needed if less than 20 users.
				//One additional person needed per 20 after that.
				var target = getTarget();
				if(bonuspoints.length >= target) {
					bot.speak('Extra points! Nam nam nam!');
					bot.vote('up');
				}
			}
			break;
			
		case 'points':
			var target = getTarget();
			bot.speak('Bonus points: ' + bonuspoints.length + '. Needed: ' + target + '.');
			break;
			
		case 'bonusdebug':
			var test = 'voted: ';
			for (i in bonuspoints) {
				test += bonuspoints[i] + ', ';
			}
			bot.speak(test);
			break;
			
		//--------------------------------------
		//USER COMMANDS
		//--------------------------------------

		//Displays a list of users in the room
		case 'users':
			var numUsers = 0;
			var output = '';
			for (var i in usersList) {
				output += (usersList[i].name) + ', ';
				numUsers++;
			}
			bot.speak(numUsers + ' users in room: '
				+ output.substring(0,output.length - 2));
			break;

		case 'I enjoy that band.':
			setTimeout(function() {
				bot.speak('They areeee delicious!');
			}, 1200);
			break;

		//Outputs bot owner
		case 'owner':
			bot.speak(config.ownerResponse);
			break;

		//Outputs github url for SparkleBot
		case 'source':
			bot.speak('My source code is available at: '
				+ 'https://github.com/neidz11/Spyder-Trap-TT-Bot');
			break;

		//Ping bot
		//Useful for users that use the iPhone app
		case 'ping':
			var rand = Math.random();
			if (rand < 0.5) {
				bot.speak('You\'re still here, '+name+'!');
			} else {
				bot.speak('Pong, '+name+'!');
			}
			break;

		//Rules for the room
		case 'rules':
			bot.speak('No rules.  Enjoy our room!');
			setTimeout(function() {
				bot.speak('No queue, fastest finger wins.');
			}, 600);
			break;

		//hugs support.
		case 'hugs xxSpyderTrapxx':
		case 'hugs spyder':
		case 'hug spyder':
		case 'hugs spyder trap':
		case 'hug spyder trap':
			var rand = Math.random();
			var timetowait = 1600;
			if (rand < 0.4) {
				setTimeout(function() {
					bot.speak('Watch it now!');
				}, 1500);
				timetowait += 600;
			}
			setTimeout(function() {
				bot.speak('hugs ' + data.name);
			}, timetowait);
			break;
		case 'best development shop?':
		case 'Best development shop?':
			bot.speak('SPYDER TRAP! BOP BOP BEE BOOP');
		break;
		//--------------------------------------
		//HTTP REST QUERIES
		//--------------------------------------

		//Returns three similar songs to the one playing.
		//Uses last.fm's API
        case 'similar':
        	if (config.uselastfmAPI) {
				request('http://ws.audioscrobbler.com/2.0/?method=track.getSimilar'
					+ '&artist=' + encodeURIComponent(currentsong.artist)
					+ '&track='  + encodeURIComponent(currentsong.song)
      				+ '&api_key=' + config.lastfmkey + '&format=json&limit=5',
                	function cbfunc(error, response, body) {
                    	if(!error && response.statusCode == 200) {
                        	var formatted = eval('(' + body + ')');
							var botstring = 'Similar songs to ' + currentsong.song + ': ';
							try {
								//for (i in formatted.similartracks.track) {
								//	botstring += formatted.similartracks.track[i].name + ' by '
								//		+ formatted.similartracks.track[i].artist.name + ', ';
								//}
								
								//Using this instead because last.fm always returns
								//two songs by the same artist when making this call
								botstring += formatted.similartracks.track[2].name + ' by '
									+ formatted.similartracks.track[2].artist.name + ', ';
								botstring += formatted.similartracks.track[3].name + ' by '
									+ formatted.similartracks.track[3].artist.name + ', ';
								botstring += formatted.similartracks.track[4].name + ' by '
									+ formatted.similartracks.track[4].artist.name + ', ';
							} catch (e) {
								//
							}
							bot.speak(botstring.substring(0, botstring.length - 2));
                        }
                });
			}
        	break;
	
		//Returns three similar artists to the one playing.
		//Uses last.fm's API
		case 'similarartists':
			if (config.uselastfmAPI) {
				request('http://ws.audioscrobbler.com/2.0/?method=artist.getSimilar'
                	+ '&artist=' + encodeURIComponent(currentsong.artist)
                    + '&api_key=' + config.lastfmkey + '&format=json&limit=4',
                	function cbfunc(error, response, body) {
                    	if(!error && response.statusCode == 200) {
                        	var formatted = eval('(' + body + ')');
                            var botstring = 'Similar artists to ' + currentsong.artist + ': ';
							try {
                            	for (i in formatted.similarartists.artist) {
                                    botstring += formatted.similarartists.artist[i].name + ', ';
                                }
							} catch (e) {
								//
							}
                            bot.speak(botstring.substring(0, botstring.length - 2));
                        }
                });
			}
			break;


		//--------------------------------------
		//USER DATABASE COMMANDS
		//--------------------------------------

		//Returns the total number of awesomes logged in the songlist table
		case 'totalawesomes':
			client.query('SELECT SUM(UP) AS SUM FROM '
				+ config.SONG_TABLE,
				function selectCb(error, results, fields) {
					var awesomes = results[0]['SUM'];
					bot.speak('Total awesomes in this room: ' + awesomes);					
				});
			break;

		//Returns the three song plays with the most awesomes in the songlist table
		case 'bestplays':
			client.query('SELECT CONCAT(song,\' by \',artist) AS TRACK, UP FROM '
				+ config.SONG_TABLE + ' ORDER BY UP DESC LIMIT 3',
				function select(error, results, fields) {
					var response = 'The song plays I\'ve heard with the most awesomes: ';
					for (i in results) {
						response += results[i]['TRACK'] + ': '
							+ results[i]['UP'] + ' awesomes.  ';
					}
					bot.speak(response);
			});
			break;
		
		//Returns the three DJs with the most points logged in the songlist table
		case 'bestdjs':
			client.query('SELECT djname as DJ, sum(up) as POINTS from '
				+ '(SELECT * from ' + config.SONG_TABLE + ' order by id desc) as SORTED'
				+ ' group by djid order by sum(up) desc limit 3',
				function select(error, results, fields) {
					var response = 'The DJs with the most points accrued in this room: ';
					for (i in results) {
						response += results[i]['DJ'] + ': '
							+ results[i]['POINTS'] + ' points.  ';
					}
					bot.speak(response);
			});
			break;

		//Returns the three DJs with the most points logged in the songlist table
		case 'worstdjs':
			client.query('SELECT djname as DJ, sum(down) as POINTS from '
				+ '(SELECT * from ' + config.SONG_TABLE + ' order by id desc) as SORTED'
				+ ' group by djid order by sum(down) desc limit 3',
				function select(error, results, fields) {
					var response = 'The DJs with the most lames accrued in this room: ';
					for (i in results) {
						response += results[i]['DJ'] + ': '
							+ results[i]['POINTS'] + ' lames.  ';
					}
					bot.speak(response);
			});
			break;

		//Returns the three most-played songs in the songlist table
		case 'mostplayed':
			client.query('SELECT CONCAT(song,\' by \',artist) AS TRACK, COUNT(*) AS COUNT FROM '
				+ config.SONG_TABLE + ' GROUP BY CONCAT(song,\' by \',artist) ORDER BY COUNT(*) '
				+ 'DESC LIMIT 3',
				function select(error, results, fields) {
					var response = 'The songs I\'ve heard the most: ';
					for (i in results) {
						response += results[i]['TRACK'] + ': '
							+ results[i]['COUNT'] + ' plays.  ';
					}
					bot.speak(response);
			});
			break;

		//Returns the three most-awesomed songs in the songlist table
		case 'mostawesomed':
			client.query('SELECT CONCAT(song,\' by \',artist) AS TRACK, SUM(up) AS SUM FROM '
				+ config.SONG_TABLE + ' GROUP BY CONCAT(song,\' by \',artist) ORDER BY SUM '
				+ 'DESC LIMIT 3',
				function select(error, results, fields) {
					var response = 'The most awesomed songs I\'ve heard: ';
					for (i in results) {
						response += results[i]['TRACK'] + ': '
							+ results[i]['SUM'] + ' awesomes.  ';
					}
					bot.speak(response);
			});
			break;

		//Returns the three most-lamed songs in the songlist table
		case 'mostlamed':
			client.query('SELECT CONCAT(song,\' by \',artist) AS TRACK, SUM(down) AS SUM FROM '
				+ config.SONG_TABLE + ' GROUP BY CONCAT(song,\' by \',artist) ORDER BY SUM '
				+ 'DESC LIMIT 3',
				function select(error, results, fields) {
					var response = 'The most lamed songs I\'ve heard: ';
					for (i in results) {
						response += results[i]['TRACK'] + ': '
							+ results[i]['SUM'] + ' lames.  ';
					}
					bot.speak(response);
			});
			break;
			
		//Returns the user's three most played songs
		case 'mymostplayed':
			client.query('SELECT CONCAT(song,\' by \',artist) AS TRACK, COUNT(*) AS COUNT FROM '
				+ config.SONG_TABLE + ' WHERE (djid = \''+ data.userid +'\')'
				+ ' GROUP BY CONCAT(song,\' by \',artist) ORDER BY COUNT(*) DESC LIMIT 3',
				function select(error, results, fields) {
					var response = 'The songs I\'ve heard the most from you: ';
					for (i in results) {
						response += results[i]['TRACK'] + ': '
							+ results[i]['COUNT'] + ' plays.  ';
					}
					bot.speak(response);
			});
			break;

		//Returns the user's three most-awesomed songs (aggregate)
		case 'mymostawesomed':
			client.query('SELECT CONCAT(song,\' by \',artist) AS TRACK, SUM(up) AS SUM FROM '
				+ config.SONG_TABLE + ' WHERE (djid = \''+ data.userid +'\')'
				+ ' GROUP BY CONCAT(song,\' by \',artist) ORDER BY SUM DESC LIMIT 3',
				function select(error, results, fields) {
					var response = 'The most appreciated songs I\'ve heard from you: ';
					for (i in results) {
						response += results[i]['TRACK'] + ': '
							+ results[i]['SUM'] + ' awesomes.  ';
					}
					bot.speak(response);
			});
			break;
		//Returns the user's three most-used artists (aggregate)
		case 'myartists':
			client.query('SELECT artist, COUNT(*) AS COUNT FROM '
			+ config.SONG_TABLE + ' WHERE (djid = \''+ data.userid +'\')'
			+ ' GROUP BY artist ORDER BY COUNT(*) DESC LIMIT 3' ,
			function select(error, results, fields) {
				var response = 'The artists I\'ve heard you play the most are: ';
				for (i in results) {
					response += results[i]['artist'] + ': '
						+ results[i]['COUNT'] + ' plays. ';
				}
				bot.speak(response);
			});
		break;
		//Returns the user's three most-lamed songs (aggregate)
		case 'mymostlamed':
			client.query('SELECT CONCAT(song,\' by \',artist) AS TRACK, SUM(down) AS SUM FROM '
				+ config.SONG_TABLE + ' WHERE (djid = \''+ data.userid +'\')'
				+ ' GROUP BY CONCAT(song,\' by \',artist) ORDER BY SUM DESC LIMIT 3',
				function select(error, results, fields) {
					var response = 'The most hated songs I\'ve heard from you: ';
					for (i in results) {
						response += results[i]['TRACK'] + ': '
							+ results[i]['SUM'] + ' lames.  ';
					}
					bot.speak(response);
			});
			break;
		//For debugging/monitoring of db
		//Returns the number of songs logged and the size of the database in MB.
		case 'dbsize':
			//var response = 'Songs logged';
			client.query('SELECT COUNT(STARTED) AS COUNT FROM ' + config.SONG_TABLE,
				function selectCb(error, results, fields) {
					bot.speak('Songs logged: ' + results[0]['COUNT'] + ' songs.');
			});
			setTimeout(function() {
				client.query('SELECT started '
				+ ' FROM SONGLIST'
				+ ' WHERE id = 1',
				function selectCb(error, results, fields) {
					bot.speak('I started logging songs on ' +results[0]['started']);
				});
			}, 500);
			setTimeout(function() {
				client.query('SELECT sum( data_length + index_length ) / 1024 / 1024 \'dbsize\''
					+ ' FROM information_schema.TABLES'
					+ ' WHERE (table_schema = \'' + config.DATABASE + '\')',
					function selectCb(error, results, fields) {
						bot.speak('Database size: ' + results[0]['dbsize'] + ' MB.');
				});
			}, 500);
			break;
		
		
		//--------------------------------------
		//ADMIN-ONLY COMMANDS
		//--------------------------------------

		//Tells bot to awesome the current song
		case '\.a':
			if (admincheck(data.userid)) {
				bot.vote('up');
				bot.speak('Sick!');
			}
			break;

		//Tells bot to lame the current song
		case '\.l':
			if (admincheck(data.userid)) {
				bot.vote('down');
				bot.speak('Boo!');
			}
			break;

		//Pulls a DJ after their song.
		case 'pulldj':
			if (admincheck(data.userid)) {
				if (!userstepped) {
					bot.remDj(usertostep);
				}
			}
			break;

		//Pulls the current dj.
		case 'pullcurrent':
			if (admincheck(data.userid)) {
				if(currentsong.djid != null) {
					bot.remDj(currentsong.djid);
				}
			}
			break;

		//Pulls all DJs on stage and plays a song.
		case 'cb4':
			if (admincheck(data.userid)) {
				bot.speak('Awwwww yeah');
				for (i in djs) {
					bot.remDj(djs[i]);
				}
				bot.addDj();
			}
			break;

		//Changes room
		case 'ST, go home':
			if (data.userid == config.MAINADMIN) {
				bot.speak('*Hangs Head* Oh fine!');
				bot.roomDeregister();
				bot.roomRegister(config.MYROOMID);
			}
			break;
		case 'ST, go to Indie Room':
			if (data.userid == config.MAINADMIN) {
				bot.speak('Hipster time!');
				bot.roomDeregister();
				bot.roomRegister(config.ROOMID);
			}
			break;

		//Step up to DJ
		case 'ST, step up':
			if (admincheck(data.userid)) {
				manualDj = true;
				bot.addDj();
			} else {
				bot.speak('You aint mah master!');
			}
			break;
		case 'DJs':
			bot.speak(checkDjCount()+' Djs');
		break;
		case 'ST, seriously?':
			bot.speak('Oh fine!');
			bot.skip();
		break;
		//Step down if DJing
		case 'ST, step down':
			if (admincheck(data.userid)) {
				manualDj = false;
				bot.remDj(config.USERID);
			} else {
				bot.speak('You aint mah master!');
			}
			break;
		//Bot addsong
		case 'ST, you like this song':
			if(admincheck(data.userid)) {
				bot.roomInfo(true, function(data) {
     				var newSong = data.room.metadata.current_song._id;
      				var newSongName = songName = data.room.metadata.current_song.metadata.song;
      				bot.playlistAdd(newSong);
					bot.speak('I love '+newSongName+' !');
				});
			} else {
				bot.speak('You ain\'t no jedi!');
			}
			break;
		//Shuts down bot (only the main admin can run this)
		//Disconnects from room, exits process.
		case 'ST, shut down':
			if (data.userid == config.MAINADMIN) {
				bot.roomDeregister();
				process.exit(0);
			}
		
	}
	//Returns weather for a user-supplied city using YQL.
	//Returns bot's location if no location supplied.
	if(text.match(/^.weather/)) {
		var userlocation = text.substring(9);
		if (userlocation == '') {
			userlocation = 20151;
		}
		request('http://query.yahooapis.com/v1/public/yql?q=use%20\'http%3A%2F%2Fgithub'
		        + '.com%2Fyql%2Fyql-tables%2Fraw%2Fmaster%2Fweather%2Fweather.bylocatio'
		        + 'n.xml\'%20as%20we%3B%0Aselect%20*%20from%20we%20where%20location%3D'
		        + '%22' + encodeURIComponent(userlocation) + '%22%20and%20unit%3D\'f\''
		        + '&format=json&diagnostics=false',
        	function cbfunc(error, response, body) {
        	        if (!error && response.statusCode == 200) {
        	                var formatted = eval('(' + body + ')');
        	        	try {
						var loc = formatted.query.results.weather.rss.channel.location.city + ', '
        	            if (formatted.query.results.weather.rss.channel.location.region != '') {
        	            	loc += formatted.query.results.weather.rss.channel.location.region;
        	            } else {
        	            	loc += formatted.query.results.weather.rss.channel.location.country;
        	            }
        	        	var temp = formatted.query.results.weather.rss.channel.item.condition.temp;
        	        	var cond = formatted.query.results.weather.rss.channel.item.condition.text;
        	        	bot.speak('The weather in ' + loc + ' is ' + temp + 'ºF and ' + cond + '.');
                	} catch(e) {
				bot.speak('Sorry, I can\'t find that location.');
			}}
        });
	}

	if(text.match(/^mysongs/)) {
		//Returns the user's last 3 (or X for arg) songs played
		var argStr = text.replace(/^mysongs\s+/, '');
		
  	numSongs = 3;
		if (argStr.match(/\d+/)) {
      numSongs = argStr;
      
  		// sanity check to prevent huge chat dump - 20 max
  		if (numSongs > 20) {
  		  numSongs = 3;
  		}
  	}
		
		client.query('SELECT CONCAT(song,\' by \',artist) AS TRACK, DATE_FORMAT(started, \'%a %l-%d %e:%i %p\') AS started_fmt FROM '
		+ config.SONG_TABLE + ' WHERE (djid = \''+ data.userid +'\')'
		+ ' ORDER BY started DESC LIMIT ' + numSongs ,
		function select(error, results, fields) {
			timeoutVal = 100;
			setTimeout(function () { bot.speak('The last songs I\'ve heard you play are:') }, timeoutVal);
			for (i in results) {
			  timeoutVal += 100;
				setTimeout(function () { bot.speak(results[i]['TRACK'] + ' on: ' + results[i]['started_fmt']) }, timeoutVal);
			}
		});
	};
	
	if(text.match(/^.find/)) {
		var location = text.split(' ', 2);
		var thingToFind = text.substring(7 + location[1].length);
		request('http://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20local.search'
			+'%20where%20zip%3D\'' + encodeURIComponent(location[1]) + '\'%20and%20query%3D\''
			+ encodeURIComponent(thingToFind) + '\'%20limit%201&format=json',
			function cbfunc(error, response, body) {
				if (!error && response.statusCode == 200) {
					var formatted = eval('(' + body + ')');
					try {
						var botresponse = 'Nearest ' + thingToFind + ' location to ' + location[1] + ': ';
							botresponse += formatted.query.results.Result.Title + ' ('
								+ formatted.query.results.Result.Rating.AverageRating + ' ☆) '
								+ formatted.query.results.Result.Address + ', ' 
								+ formatted.query.results.Result.City + ' ('
								+ formatted.query.results.Result.Distance + ' miles).  ';
						
						bot.speak(botresponse);
					} catch (e) {
						bot.speak('Sorry, no locations found.');
					}
				}
		});
	}

	//Returns a list of names a user has gone by
	//Usage: 'pastnames [username]'
	if (text.match(/^pastnames/)) {
		//bot.speak('DEBUG: I\'m searching for '+text.substring(9));
		client.query('SELECT djname FROM ' + config.SONG_TABLE
			+ ' WHERE (djid LIKE (SELECT djid FROM '
			+ config.SONG_TABLE + ' WHERE (djname like ?)'
			+ ' ORDER BY id DESC LIMIT 1)) GROUP BY djname',
			[text.substring(10)],
			function select(error, results, fields) {
					var response = 'Names I\'ve seen that user go by: ';
					for (i in results) {
						response += results[i]['djname'] + ', ';
					}
					bot.speak(response.substring(0,response.length-2));
			});
	}		

});

//Runs when no song is playing.
bot.on('nosong', function (data) {
	autoDj();
});

//Runs at the end of a song
//Logs song in database, reports song stats in chat
bot.on('endsong', function (data) {
	//Log song in DB
	addToDb();

	//Used for room enforcement
	userstepped = false;
	usertostep = currentsong.djid;

	//Report song stats in chat
	if (config.reportSongStats) {
		bot.speak(currentsong.song + ' stats: awesomes: '
			+ currentsong.up + ' lames: ' + currentsong.down);
	}
});

//Runs when a new song is played
//Populates currentsong data, tells bot to step down if it just played a song,
//logs new song in console, auto-awesomes song
bot.on('newsong', function (data) {	
	//Populate new song data in currentsong
	currentsong.artist = data.room.metadata.current_song.metadata.artist;
	currentsong.song = data.room.metadata.current_song.metadata.song;
	currentsong.djname = data.room.metadata.current_song.djname;
	currentsong.djid = data.room.metadata.current_song.djid;
	currentsong.up = data.room.metadata.upvotes;
	currentsong.down = data.room.metadata.downvotes;
	currentsong.listeners = data.room.metadata.listeners;
	currentsong.started = data.room.metadata.current_song.starttime;
	currentsong.songid = data.room.metadata.current_song._id;
	
	//Add song id to DB
	
	//Log in console
	if (config.logConsoleEvents) {
		console.log('Now Playing: '+currentsong.artist+' - '+currentsong.song);
	}

	//Auto-awesome
	if (config.autoAwesome) {
		var randomwait = Math.floor(Math.random() * 20) + 4;
		setTimeout(function() {
			bot.vote('up');
		}, randomwait * 1000);
	}
	
	//Reset bonus points
	bonuspoints = new Array();
	
});

//Runs when a dj steps down
//Logs in console
bot.on('rem_dj', function (data) {
	autoDj();
	//Log in console
	//console.log(data.user[0]);
	if (config.logConsoleEvents) {
		console.log('Stepped down: '+ data.user[0].name + ' [' + data.user[0].userid + ']');
	}

	//Remove from dj list
	for (i in djs) {
		if (djs[i] == data.user[0].userid) {
			delete djs[i];
		}
	}
});

//Runs when a dj steps up
//Logs in console
bot.on('add_dj', function(data) {
	autoDj();
	//Log in console
	if (config.logConsoleEvents) {
		console.log('Stepped up: ' + data.user[0].name);
	}
	djs[djs.length] = data.user[0].userid;
});

bot.on('snagged', function(data) {
	bonuspoints.push(usersList[data.userid].name);
	var target = getTarget();
	if(bonuspoints.length >= target) {
		bot.speak('Bonus!');
		bot.vote('up');
	}	
});
