/* Name: midi.js
 * Author: Devon McGrath (devonmcgrath.me)
 * Description: This file is responsible for parsing a MIDI file and generating
 * the appropriate graphics to display to the user.
 */

var COLOURS = ["#00FF00", "#0000FF", "#FF00FF", "#FFFF00", // track note colours
	"#FFAF00", "#00FFFF", "#FF0000", "#AF0000",
	"#AF00AF", "#00AFAF", "#00AF00", "#0000AF",
	"#AFAF00", "#AFFF00", "#AF00FF", "white"];
var reader = null; // file reader
var tracksDiv = document.getElementById('tracks'); // div for the notes
var noteCanvas = document.getElementById('canvas-notes'); // canvas for drawing notes
var slider1 = document.getElementById('slider1'); // slider for time
var slider2 = document.getElementById('slider2'); // slider for time
var song = null; // object to control song properties
var page = null; // size of the page
var PIXELS_PER_SECOND = 110.0; // the number of pixels per second to display for the song and notes
var MIDI_EVENT = 1; // MIDI event identifier
var SYSEX_EVENT = 2; // System Exclusive event identifier
var META_EVENT = 3; // Meta event identifier

/** Initializes the application. */
function init() {
	
	var bErr = document.getElementById('browser-errors');
	
	// Check file support by the browser
	if (!checkFileAPI()) { // file support
		bErr.style.display = 'block';
		bErr.innerHTML += '<p>Error: Your browser does not support the file APIs.</p>\n';
	}
	
	// Check for canvas support
	if (!isCanvasSupported()) {
		bErr.style.display = 'block';
		bErr.innerHTML += '<p>Warning: Your browser does not support canvas. Graphics updates will be CPU intensive.</p>\n';
	} else { // canvas is supported by the browser
		noteCanvas.style.display = 'block';
	}
	
	pageResize();
}

/** Handles the page being resized. */
function pageResize() {
	
	// Get the new dimensions
	page = getScreenSize();
	
	// Update the canvas properties
	if (isCanvasSupported()) {
		noteCanvas.setAttribute('width', page.width);
		noteCanvas.setAttribute('height', page.height);
		if (song) {
			song.updatePos();
		}
	}
}

/** Gets the size of the page. */
function getScreenSize() {
	var w = window.innerWidth
		|| document.documentElement.clientWidth
		|| document.body.clientWidth;

	var h = window.innerHeight
		|| document.documentElement.clientHeight
		|| document.body.clientHeight;

	return {"width": w, "height": h};
}

/** Check for the various File API support. */
function checkFileAPI() {
	if (window.File && window.FileReader && window.FileList && window.Blob) {
		reader = new FileReader();
		return true; 
	}
	return false;
}

/** Check for canvas support in the browser. */
function isCanvasSupported(){
  var elem = document.createElement('canvas');
  return !!(elem.getContext && elem.getContext('2d'));
}

/**
 * Gets the text from a file input object and sends the output to a handler
 * function that takes the file data as an argument.
 */
function readText(filePath, handler) {
	var output = "";
	if(filePath.files && filePath.files[0]) {           
		reader.onload = function (e) {
			output = e.target.result;
			handler(output);
		};
		if (reader.readAsBinaryString) {
			reader.readAsBinaryString(filePath.files[0]);
		} else {
			reader.readAsText(filePath.files[0]);
		}
	}//end if html5 filelist support
	else if(ActiveXObject && filePath) { // fallback to IE 6-8 support via ActiveX
		try {
			reader = new ActiveXObject("Scripting.FileSystemObject");
			var file = reader.OpenTextFile(filePath, 1); // ActiveX File Object
			file.Close(); // close file input stream
			handler(output);
		} catch (e) {
			if (e.number == -2146827859) {
				alert('Unable to access local files due to browser security settings. ' + 
				 'To overcome this, go to Tools->Internet Options->Security->Custom Level. ' + 
				 'Find the setting for "Initialize and script ActiveX controls not marked as safe" and change it to "Enable" or "Prompt"'); 
			}
		}       
	}
	else { // Not supported
		return false;
	}       
	return true;
}

/** Sets the control screen visible or hidden. */
function setControlsVisible(visible) {
	document.getElementById('control').style.display = (visible? 'block' : 'none');
}

/** Updates the text of the Play/Pause buttons. */
function updatePlayButtons(playing) {
	document.getElementById('play-btn1').innerHTML = (playing? 'Pause' : 'Play');
	document.getElementById('play-btn2').innerHTML = (playing? 'Pause' : 'Play');
}

/**
 * Sets up the application with a new MIDI file.
 *	data	the data from a MIDI file.
 */
function setupMIDI(data) {

	// Make sure nothing is already playing
	if (song) {song.stop();}
	
	// Get the MIDI file data in a more usable format
	var file = parseData(data);
	
	// Setup the tracks to display the notes if there is no canvas
	tracksDiv.innerHTML = '';
	if (!isCanvasSupported()) {
		tracksDiv.style.height = (file.length * PIXELS_PER_SECOND) + 'px';
		var html = '';
		for (var i = file.noteTracks.length - 1; i >= 0; i --) {
			var t = file.noteTracks[i].notes;
			var n = t.length;
			for (var j = 0; j < n; j ++) { // draw all the white key notes
				if (t[j].isWhiteKey()) {
					html += t[j].getHTML();
				}
			}
			for (var j = 0; j < n; j ++) { // draw all the black key notes
				if (!t[j].isWhiteKey()) {
					html += t[j].getHTML();
				}
			}
		}
		tracksDiv.innerHTML = html;
	}
	
	// Update the controls
	html = '';
	var tControl = document.getElementById('tracks-available');
	var n = file.noteTracks.length;
	for (var i = 0; i < n; i ++) {
		var t = file.noteTracks[i];
		html += '\n<div class="track-info"><h4>Track '+(i+1)+': '+t.name+
			'</h4><p><button onclick="'+'song.setTrackVisible('+i+
			',this.innerHTML == \'Show\');" id="tb'+i+'">Hide</button> Colour: '+
			'<span style="width: 30px; height: 14px; background: '+t.colour+'; '+
			'display: inline-block; border: 1px solid black;"></span></p><p>Notes: '+
			t.noteCount + '</p></div>';
	}
	tControl.innerHTML = html;
	
	// Create the song
	song = new Song(file);
	song.speed = document.getElementById('set-speed').value;
	song.updatePos();
}

/**
 * Parses the data from a MIDI file.
 */
function parseData(data) {

	// Special cases
	var HEADER = "MThd", TRACK = "MTrk";
	var file = {"header": {},
		"noteTracks": [],
		"dataTracks": [],
		"length": 0,
		"track1": null,
		"tempoMap": null
	};
	if (!data || data.length == 0 || data.indexOf(HEADER) != 0) {
		return file;
	}
	
	// Read the file data
	var chunk, len, tempoChanges, tempoMapTrack, maxLen = 0;
	try {
		while (data.length > 0) {
			
			// Get information about the chunk
			chunk = data.substr(0, 4);
			len = value(data.substr(4, 4));
			
			// Process a track chunk
			if (len > 0 && chunk == TRACK) {
				var next = data.indexOf(TRACK, 4);
				var tdata = next >= 0? data.substring(0, next) : data;
				var track = processTrack(tdata, file.header); 
				
				// Add the track to the appropriate array
				if (file.noteTracks.length + file.dataTracks.length == 0) {
					file.track1 = track;
					tempoMapTrack = track;
					tempoChanges = track.tempoMap.length;
				}
				if (track.noteCount > 0) { // has note data
					file.noteTracks.push(track);
				} else { // just other data
					file.dataTracks.push(track);
				}
				
				// Determine if track has the most set tempos
				if (tempoChanges < track.tempoMap.length) {
					tempoChanges = track.tempoMap.length;
					tempoMapTrack = track;
				}
				if (maxLen < track.length) {
					maxLen = track.length;
				}
				
				// Update the position
				if (next < 0) {
					break;
				}
				data = data.slice(next);
			}
			
			// Process the header chunk
			else if (len > 0 && chunk == HEADER) {
				file.header = processHeader(data.substr(8, len));
				data = data.slice(len + 8);
			}
		}
	} catch (e) {}
	
	// Update the track colours
	for (var i = 0; i < file.noteTracks.length; i ++) {
		var colour = COLOURS[i];
		file.noteTracks[i].colour = colour? colour : 'white';
	}
	
	// Get the tempo map and length
	if (tempoMapTrack) {
		file.length = tempoMapTrack.length;
		file.tempoMap = tempoMapTrack.tempoMap;
	}
	if (!tempoMapTrack || (tempoMapTrack && tempoMapTrack.tempoMap.length == 2)) {
		file.length = maxLen;
	}
	document.getElementById('song-length').innerHTML = Math.round(file.length*100) / 100 + ' seconds';
	
	// Get the notes for each track
	for (var i = 0; i < file.noteTracks.length; i ++) {
		file.noteTracks[i].notes = getNotes(file.noteTracks[i], file.tempoMap, i);
	}
	
	return file;
}

/**
 * Processes the header chunk data in a MIDI file.
 *	data	the raw header chunk data from a MIDI file
 *
 * Returns a JSON object with 'format', 'tracks', 'division',
 * 'ticksPerQuarterNote', 'fps', 'ticksPerFrame', and
 * 'ticksPerSecond'. Only the relevant properties are filled based on the
 * file format (i.e. ticksPerQuarterNote will be null if the timing is SMPTE).
 */
function processHeader(data) {
	
	var header = {
		"format": 1,
		"tracks": 0,
		"division": -1,
		"ticksPerQuarterNote": null,
		"fps": null,
		"ticksPerFrame": null,
		"ticksPerSecond": null
	};
	
	// Remove header info if necessary
	if (data.startsWith("MThd")) {
		data = data.slice(8);
	}
	
	// Get the format and number of tracks
	header.format = value(data.substr(0, 2));
	header.tracks = value(data.substr(2, 2));
	
	// Determine timing information
	var div = value(data.substr(4, 2));
	if ((div & 0x8000) == 0) { // given ticks per quarter note
		header.ticksPerQuarterNote = div;
	} else { // SMPTE timing format
		
		// Get the FPS
		header.fps = data.charCodeAt(4) & 0x7F;
		if (header.fps == 0xE8) {header.fps = 24;}
		else if (header.fps == 0xE7) {header.fps = 25;}
		else if (header.fps == 0xE3) {header.fps = 30;} // drop frame
		else if (header.fps == 0xE2) {header.fps = 30;} // no drop frame
		
		// Get the ticks per frame
		header.ticksPerFrame = data.charCodeAt(5);
		header.ticksPerSecond = header.ticksPerFrame * header.fps;
	}
	
	return header;
}

/**
 * Processes raw track data from a MIDI file.
 * 	data	the raw data from the MIDI file
 * 	header	the parsed header chunk of the MIDI file.
 *
 * Returns a JSON object with 'notes', 'colour', 'visibility', 'name',
 * 'events', 'noteCount', 'tempoMap', and 'length' in seconds. The notes are
 * not retreived here since there may not be the appropriate tempo map to
 * gather relevant time information.
 */
function processTrack(data, header) {
	
	var track = {"notes": [], "colour": "white", "visibility": "visible",
		"name": "not specified", "events": [], "noteCount": 0, "tempoMap": [],
		"length": 0};
	
	// Remove the chunk name and length if necessary
	if (data.startsWith("MTrk")) {
		data = data.slice(8); // 8 -> (MTrk : 4 bytes) + ([length] : 4 bytes)
	}
	
	// Loop through the track until there is no more data to process
	var lastStatus = null, end = false;
	var microsecondsPerQuarterNote = 500000, ticks = 0, seconds = 0.0;
	var secondsPerTick = microsecondsPerQuarterNote / (1000000.0 * header.ticksPerQuarterNote);
	if (!header.ticksPerQuarterNote) {
		secondsPerTick = 1.0 / header.ticksPerSecond;
	}
	track.tempoMap.push(0);
	track.tempoMap.push(secondsPerTick);
	while (data.length > 0) {
		
		// Get the delta time and status byte of the event
		var time = lengthOf(data);
		var statusByte = data.charCodeAt(time[1] + 1);
		ticks += time[0];
		seconds += (time[0] * secondsPerTick);
		
		// Meta event to process: 0xFF[type:1][length:variable][data:<-length]
		var jump = 0;
		if (statusByte == 0xFF) {
			lastStatus = null;
			statusByte = data.charCodeAt(time[1] + 2);
			data = data.slice(time[1] + 3);
			var len = lengthOf(data);
			var e = new MetaEvent(time[0], statusByte, data.substr(len[1] + 1, len[0]));
			track.events.push(e);
			
			// Add the track name
			if (e.type == 0x03) {
				track.name = e.data;
			}
			
			// Update the tempo map
			else if (e.type == 0x51 && header.ticksPerQuarterNote && !end) {
				
				// Calculate new time
				microsecondsPerQuarterNote = value(e.data);
				secondsPerTick = microsecondsPerQuarterNote / (1000000.0 * header.ticksPerQuarterNote);
				
				// Update the map
				var n = track.tempoMap.length;
				if (track.tempoMap[n - 2] == ticks) { // no time passed since last set tempo
					track.tempoMap[n - 1] = secondsPerTick;
				} else if (track.tempoMap[n - 1] != secondsPerTick) { // new tempo, add it
					track.tempoMap.push(ticks);
					track.tempoMap.push(secondsPerTick);
				}
			}
			
			// End of track
			else if (e.type == 0x2F) {
				end = true; // end of track event
			}
			
			jump = len[0] + len[1] + 1;
		}
		
		// MIDI event to process: [status:1][data:2|3]
		else if (statusByte >= 0x80 && statusByte < 0xF0) {
			lastStatus = statusByte;
			data = data.slice(time[1] + 1);
			jump = (statusByte >= 0xC0 && statusByte <= 0xDF)? 2 : 3;
			var e = new MIDIEvent(time[0], data.substr(0, jump));
			track.events.push(e);
			if (statusByte >= 0x90 && statusByte <= 0x9F) { // note on
				if (e.data.charCodeAt(2) != 0) { // if the velocity is zero, it is a note off
					track.noteCount ++;
				}
			}
		}
		
		// System exclusive event to process: [0xF0|0xF7][length:variable][data:<-length]
		else if (statusByte == 0xF0 || statusByte == 0xF7) {
			lastStatus = null;
			data = data.slice(time[1] + 2);
			var len = lengthOf(data);
			var e = new SysexEvent(time[0], statusByte, data.substr(len[1] + 1, len[0]));
			track.events.push(e);
			jump = len[0] + len[1] + 1;
		}
		
		// Carry over event from last MIDI event
		else if (lastStatus != null) {
			jump = (lastStatus >= 0xC0 && lastStatus <= 0xDF)? 1 : 2;
			var d = String.fromCharCode(lastStatus) + data.substr(time[1] + 1, jump);
			var e = new MIDIEvent(time[0], d);
			track.events.push(e);
			jump += time[1] + 1;
			if (lastStatus >= 0x90 && lastStatus <= 0x9F) { // note on
				if (e.data.charCodeAt(2) != 0) { // if the velocity is zero, it is a note off
					track.noteCount ++;
				}
			}
		}
		
		// No recognized event
		else {
			lastStatus = null;
			data = data.slice(time[1] + 1);
		}
		
		// Update the data
		data = data.slice(jump);
	}
	track.length = seconds;
	
	return track;
}

/** Converts a string to an integer based on the char code values. */
function value(str) {
	if (!str || str.length == 0) {return 0;}
	var val = 0, n = str.length;
	for (var i = 0; i < n; i ++) {
		val += (str.charCodeAt(i) << (n - i - 1)*8);
	}
	return val;
}

/**
 * Calculates the variable length of a string. If the string contains more than
 * the variable length, the extra characters will be ignored. Returns an array
 * with two indices: [0] is the length, [1] is the last byte included in the
 * variable length (for example, if the variable length was 1 byte, 0 would
 * be in index [1]).
 */
function lengthOf(varLen) {
	if (!varLen || varLen.length == 0) {return [0, 0];}
	var n = varLen.length, value = 0, i = 0;
	for (; i < n; i ++) {
		var c = varLen.charCodeAt(i);
		var byteVal = c & 0x7F; // c & 0111 1111
		value = (value << 7) + byteVal;
		if ((c & 0x80) == 0) {
			break;
		}
	}
	
	return [value, i];
}

/**
 * Calculates the overall track length in seconds and produces a tempo map.
 *
 * The track length is calculated based on the division (specified in the header
 * chunk). If it is based on ticks per frame, tempo changes are considered as well
 * as the ticks per quarter note specified in the header chunk. Otherwise, the ticks
 * are added up and multiplied by the ticks per second derived from the header info.
 *
 * The tempo map is an array of even length specifying the tick on which the tempo
 * changes as well as the new tempo.
 *
 * Returns an array with [0] being the length of the track in seconds and [1] being
 * the tempo map array as specified above.
 */
function getTrackLengthAndTempoMap(track, header) {
	
	if (!track || !header) {return [0.0, []];}
	var result = [0.0, []], seconds = 0.0, n = track.events.length;
	
	// Calculate the time based on the tempo
	if (header.ticksPerQuarterNote) {
		
		var microsecondsPerQuarterNote = 500000, ticks = 0;
		var secondsPerTick = microsecondsPerQuarterNote / (1000000.0 * header.ticksPerQuarterNote);
		result[1].push(0);
		result[1].push(secondsPerTick);
		for (var i = 0; i < n; i ++) {
			var e = track.events[i];
			seconds += (e.deltaT * secondsPerTick);
			ticks += e.deltaT;
			if (e.which() == META_EVENT && e.type == 0x51) {
				microsecondsPerQuarterNote = value(e.data);
				secondsPerTick = microsecondsPerQuarterNote / (1000000.0 * header.ticksPerQuarterNote);
				if (ticks == 0) {
					result[1][1] = secondsPerTick;
				} else if (result[1][result[1].length - 1] != secondsPerTick) {
					result[1].push(ticks);
					result[1].push(secondsPerTick);
				}
			} else if (e.which() == META_EVENT && e.type == 0x2F) {
				break; // end of track event
			}
		}
	}
	
	// Calculate the time based on the number of ticks per second
	else {
		
		var ticks = 0;
		for (var i = 0; i < n; i ++) {
			var e = track.events[i];
			ticks += e.deltaT;
			if (e.which() == META_EVENT && e.type == 0x2F) {
				break; // end of track event
			}
		}
		
		seconds = 1.0 * ticks / header.ticksPerSecond;
		result[1].push(0);
		result[1].push(1.0 / header.ticksPerSecond);
	}
	result[0] = seconds;
	
	return result;
}

/**
 * Gets all the notes in a track and returns them in an array.
 */
function getNotes(track, tempoMap, trackNum) {
	
	// Missing info
	if (!track || !tempoMap || !track.events) {return [];}
	
	var notes = [], n = track.events.length, hold = [], sec = 0.0, ticks = 0;
	var secondsPerTick = tempoMap[1], pos = 2;
	var LOW_LIM = 21, HIGH_LIM = 108; // limits of displayable notes on the screen
	
	// Go through all the events
	for (var i = 0; i < n; i ++) {
		
		var e = track.events[i], t = e.which();
		
		// Update time
		ticks += e.deltaT;
		sec += (e.deltaT * secondsPerTick);
		if (tempoMap[pos] && ticks >= tempoMap[pos]) {
			secondsPerTick = tempoMap[pos + 1];
			pos += 2;
		}
		
		// Check if note on/off event
		if (t == MIDI_EVENT) {
			var s = e.data.charCodeAt(0);
			if (s < 0x80 || s > 0x9F) {continue;} // not note on/off
			var vel = e.data.charCodeAt(2), c = e.getChannel(), key = e.data.charCodeAt(1);
			if (key < LOW_LIM && key > HIGH_LIM) {continue;}
			if (!hold[key]) {hold[key] = [];}
			var len = hold[key].length;
			if ((vel == 0) || (s >= 0x80 && s <= 0x8F && len > 0)) { // Note off
				if (len == 1) {
					var note = hold[key][0];
					hold[key] = [];
					note.endSec = sec;
					notes.push(new Note(key, note.startSec, sec, trackNum, c));
				} else { // more than one note, match the channel
					var note = null, j = 0;
					for (; j < len; j ++) {
						if (hold[key][j].channel == c) {
							note = hold[key][j];
							break;
						}
					}
					if (note) {
						hold[key][j] = hold[key][len - 1];
						hold[key].pop();
						note.endSec = sec;
						notes.push(new Note(key, note.startSec, sec, trackNum, c));
					}
				}
			} else if (s >= 0x90 && s <= 0x9F) { // Note on
				var note = new Note(key, sec, sec, trackNum, c);
				hold[key].push(note);
			}
		}
		
		// Check for end of track
		else if (t == META_EVENT && e.type == 0x2F) {
			
			// Send explicit note off to finish notes
			for (var j = 0; j < HIGH_LIM; j ++) {
				var lim = hold[j]? hold[j].length : 0;
				for (var k = 0; k < lim; k ++) {
					var note = hold[j][k];
					note.endSec = sec;
					notes.push(new Note(key, note.startSec, sec, trackNum, c));
				}
			}
			break;
		}
	}

	return notes;
}

/**
 * A Note represents a note on/note off pair of events on a track in a given
 * MIDI file.
 */
function Note(key, startSec, endSec, trackNum, channel) {
	this.key = key;				// key number: 0 - 127
	this.startSec = startSec;	// the note start second
	this.endSec = endSec;		// the note end second
	this.trackNum = trackNum;	// the track this note is associated with
	this.channel = channel;		// the channel this note is associated with

	/** Determines if the key is a white key. */
	this.isWhiteKey = function(){
		var m = this.key%12;
		return m != 1 && m != 3 && m != 6 && m != 8 && m != 10;
	}

	/** Calculates the number of white keys prior to this key. */
	this.getWhiteKeyNum = function(){
		var k = this.key - 21;
		var num = Math.floor(k/12)*7;
		var tmp = k%12;
		if (tmp == 11) {tmp = 7;}
		else if (tmp == 10) {tmp = 6;}
		else if (tmp == 9) {tmp = 6;}
		else if (tmp == 8) {tmp = 5;}
		else if (tmp == 7) {tmp = 4;}
		else if (tmp == 6) {tmp = 4;}
		else if (tmp == 5) {tmp = 3;}
		else if (tmp == 4) {tmp = 3;}
		else if (tmp == 3) {tmp = 2;}
		else if (tmp == 2) {tmp = 1;}
		else if (tmp == 1) {tmp = 1;}
		else {tmp = 0;}
		return num + tmp;
	}

	/** Generates an HTML string to represent the note. */
	this.getHTML = function() {
		if (this.startSec == this.endSec) {return '';}
		var isWhite = this.isWhiteKey();
		var html = '<div class="note '+(isWhite? 'w1':'w2')+' t'+trackNum;
		html += '" style="height: '+((endSec - startSec)*PIXELS_PER_SECOND)+'px;';
		html += 'left: '+(1.9*this.getWhiteKeyNum())+'%;bottom: '+(startSec*PIXELS_PER_SECOND)+'px;"></div>\n';
		return html;
	}

	/** Determines if the note is visible within a time frame. */
	this.isVisible = function(start, end) {
		return !(this.endSec < start || this.startSec > end);
	}
}

/**
 * The Song object is used to control playback of song data from a parsed MIDI
 * file. It controls the graphics that will be displayed to the user.
 */
function Song(file) {
	this.file = file;					// MIDI file object
	this.speed = 1.0;					// playback speed
	this.interval;						// the interval used to update each frame
	this.startEndPadding = 5; 			// seconds before/after the first/last note
	this.second = -this.startEndPadding;// current second in the song

	/** Updates the CSS styles for tracks when canvas is not available. */
	this.updateStyles = function(){
		
		var css = document.getElementById('song-styles');
		
		// Generate the track styles
		var tracks = this.file.noteTracks;
		var html = '';
		for (var i = tracks.length - 1; i >= 0; i --) {
			html = html + '.t' + i + ' {background: ' + tracks[i].colour +
				'; visibility: ' + tracks[i].visibility + ';}\n';
		}
		
		css.innerHTML = html;
	}

	/** Sets the display colour of a particular track. */
	this.setTrackColour = function(trackNum, colour){
		if (file.noteTracks.length > trackNum && trackNum >= 0) {
			this.file.noteTracks[trackNum].colour = colour;
			COLOURS[trackNum] = colour;
			this.updateStyles();
		}
	}

	/** Sets a track to be visible or hidden from the user. */
	this.setTrackVisible = function(trackNum, isVisible){
		if (file.noteTracks.length > trackNum && trackNum >= 0) {
			this.file.noteTracks[trackNum].visibility = isVisible? 'visible' : 'hidden';
			this.updateStyles();
			document.getElementById('tb'+trackNum).innerHTML = isVisible? 'Hide' : 'Show';
		}
	}

	/** Plays the song at the set speed. */
	this.play = function() {
		var rate = 20, delta = (rate*this.speed) / 1000.0;
		this.interval = setInterval(update, rate, this);
		
		// Function will update every 'rate' milliseconds
		function update(s) {
			s.second += delta;
			if (s.second >= s.file.length + s.startEndPadding) {
				s.second = -s.startEndPadding;
			}
			s.updateSliderPosition();
		}
	}

	/** Pauses the playback of the song. */
	this.stop = function() {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	/** Resets the song by stopping it and setting the time to 0. */
	this.resetSong = function() {
		this.stop();
		this.second = -this.startEndPadding;
		this.updateSliderPosition();
		this.updateStyles();
		updatePlayButtons(false);
	}

	/** Updates where the slider is visually for the user based on the point
	 * in the song being played. */
	this.updateSliderPosition = function() {
		var pos = (this.second / this.file.length) * 100;
		if (pos > 100) {pos = 100;}
		else if (pos < 0) {pos = 0;}
		slider1.style.left = pos + "%";
		slider2.style.left = pos + "%";
		this.updatePos();
	}

	/** Displays the graphics for the point in the song being played. */
	this.updatePos = null;
	if (isCanvasSupported()) {
		this.updatePos = function() {
			
			// Calculate the start and end second being displayed in the song
			var start = this.second, end = start + page.height / PIXELS_PER_SECOND;
			
			// Draw each of the tracks one by one
			var g = noteCanvas.getContext('2d'), noteWidth = page.width / 52.0;
			g.clearRect(0, 0, noteCanvas.width, noteCanvas.height);
			g.strokeStyle = 'black';
			for (var i = this.file.noteTracks.length - 1; i >= 0; i --) {
				var t = this.file.noteTracks[i];
				if (t.visibility == 'hidden') {continue;}
				
				// Draw the relevant notes
				var n = t.notes? t.notes.length : 0, first = n;
				g.fillStyle = t.colour;
				for (var j = 0; j < n; j ++) { // draw the white-key notes
					var note = t.notes[j];
					if (note.endSec < start) {
						continue;
					} else if (note.startSec - this.startEndPadding > end) {
						break;
					} else if (j < first) {first = j;}
					if (!note.isWhiteKey()) {continue;}
					var x = page.width * note.getWhiteKeyNum() / 52.0;
					var y = (end - note.endSec) * PIXELS_PER_SECOND;
					g.fillRect(x, y, noteWidth, PIXELS_PER_SECOND * (note.endSec - note.startSec));
					g.strokeRect(x, y, noteWidth, PIXELS_PER_SECOND * (note.endSec - note.startSec));
				}
				for (var j = first; j < n; j++) { // draw black-key notes
					var note = t.notes[j];
					if (note.endSec < start) {
						continue;
					} else if (note.startSec - this.startEndPadding > end) {
						break;
					} else if (note.isWhiteKey()) {continue;}
					var x = (page.width * note.getWhiteKeyNum() / 52.0) - noteWidth / 4;
					var y = (end - note.endSec) * PIXELS_PER_SECOND;
					g.fillRect(x, y, noteWidth / 2, PIXELS_PER_SECOND * (note.endSec - note.startSec));
					g.strokeRect(x, y, noteWidth / 2, PIXELS_PER_SECOND * (note.endSec - note.startSec));
				}
			}
		}
	} else { // no canvas support
		this.updatePos = function() {
			tracksDiv.style.bottom = -(this.second * PIXELS_PER_SECOND) + 'px';
		}
	}

	this.resetSong();
}

/** Sets the song play speed (where 1.0 is normal). */
function setSpeed(speed) {
	if (song) {song.speed = speed;}
}

/** A safe way of resetting the song. */
function resetSong() {
	if (song) {song.resetSong();}
}

/** Updates the play state of the song and determines if the control menu
 * should be closed. */
function updatePlay(playing, inMenu) {
	if (song) {
		
		// Update the graphics
		updatePlayButtons(playing);
		if (playing && inMenu) {
			setControlsVisible(false);
		}
		
		// Update the song state
		if (playing) {
			song.play();
		} else {
			song.stop();
		}
	}
}

/** Updates the new slider position based on a mouse click position on the slider. */
function newSliderPos(e, el) {
	if (song) {
		var oldSec = song.second;
		song.second = ((e.pageX - el.offsetLeft) / 199) * song.file.length;
		song.updateSliderPosition();
	}
}

/**
 * A MIDI event type is a delta time/event data pair that is a channel voice
 * message or a channel mode message.
 *
 * A channel voice message can be one of the following: note on, note off,
 * aftertouch messages, program (voice) change, pitch change, and pedal effects.
 *
 * A channel mode message can be one of the following: all sound off, all notes off,
 * Omni mode, mono mode, poly mode, reset controllers, and local control.
 */
function MIDIEvent(deltaT, data) {
	this.deltaT = deltaT;
	this.data = data;
	this.getChannel = function() {
		if (data == null || data.length == 0) {return -1;}
		return data.charCodeAt(0) & 0x0F;
	}
	this.which = function() {return MIDI_EVENT;}
}

/**
 * System exclusive events.
 */
function SysexEvent(deltaT, type, data) {
	this.deltaT = deltaT;
	this.type = type;
	this.data = data;
	this.which = function() {return SYSEX_EVENT;}
}

/**
 * A Meta event is used for events to describe things other than notes. For
 * example, lyrics, song title, track title, etc.
 *
 * Have the form: 0xFF[type][length][data]
 * To save space, the saved data is: [type][data]
 */
function MetaEvent(deltaT, type, data) {
	this.deltaT = deltaT;
	this.type = type;
	this.data = data;
	this.which = function() {return META_EVENT;}
}
