/**
 * This file contains the configurable elements of sparkle.js.
 * Replace ##### with your information
 */

//Bot information
//To find your auth/userid: http://alaingilbert.github.com/Turntable-API/bookmarklet.html
exports.AUTH   = 'auth+live+####';  //Bot's auth code
exports.USERID = '####';            //Bot's userid
exports.MAINADMIN = '####';         //Your userid

//Sets up the bot admin array
exports.admins = new Array();
exports.admins[0]  = '####'; //Admin 1 userid

//Room codes
//Use bookmarklet to find room codes.
exports.MYROOMID = '####'; //SpyderTrap Room
exports.ROOMID = '####'; //SpyderTrap Room

//Database setup
exports.DATABASE      = 'tt_spydertrap';
exports.SONG_TABLE    = 'SONGLIST';
exports.CHAT_TABLE    = 'CHATLOG';
exports.HOLIDAY_TABLE = 'HOLIDAY_GREETINGS';
exports.DBLOGIN       =  {
	user: '####',
	password: '####',
}				//A mysql login for your bot

//Last.fm API key for use with last.fm API calls
//Obtain an API key at http://www.last.fm/api/ or disable under Flags
exports.lastfmkey = '####';

//Flags
exports.logConsoleEvents = false;	//Log room data in console
exports.autoAwesome      = true;	//Auto-awesomes every song
exports.reportSongStats = true;		//Reports song stats in chat after each song
exports.welcomeUsers    = true;		//Welcomes users in chat
exports.welcomeGreeting = 'Hi, ';	//Greeting for users
exports.ownerResponse   = 'Neidz! is my owner!'; //Owner response
exports.oneDownEnforce  = false;		//Enforce a One & Down room policy
exports.botSing			= false;	//Bot sings parts of certain songs
exports.uselastfmAPI    = true;	//Use the last.fm API for certain calls
