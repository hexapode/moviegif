var fs = require('fs');
var parser = require('subtitles-parser');
var ffmpeg = require('fluent-ffmpeg');
var GIFEncoder = require('gifencoder');
var pngFileStream = require('png-file-stream');
var gm = require('gm');
var im = require('imagemagick');
var minimist = require('minimist');
var util = require('util');




var elasticsearch = require('elasticsearch');
var elasticclient = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});

var MOVIE_NAME;// = 'arrow';
var SRT;// = './movieToGif/movies/arrow.srt';
var MOVIE;// = './movieToGif/movies/arrow.mp4';
var TARGET_DIR;

var BUFFER = [];
var CURRENT = 0;
var CURRENT_FRAME = 0;
var CURRENT_FILES = 0;
var FRAMES_PER_SUBTITLES = 30;

var WIDTH = 480;
var HEIGHT = 240;

function getSrtObject() {
    var srt = fs.readFileSync(SRT);
    var data = parser.fromSrt(srt.toString());
    return data;
}

function generateGif() {
    var data = getSrtObject();

    data = sanitize(data);

    data = fusion(data);
    BUFFER = data;


    generateNext();
}


function hasPunctuation(str) {
    if (str.indexOf('.') != -1) {
        return true;
    }
    if (str.indexOf('!') != -1) {
        return true;
    }
    if (str.indexOf('?') != -1) {
        return true;
    }
    return false;
}

function fusion(data) {
    var out = [];

    for (var i = 0; i < data.length; ++i) {
        var str = data[i];
        out.push(str);
        if (hasPunctuation(str)) {
            
        }
        else {
            if (str.length > 150) {
                
            }
            else if (hasPunctuation(data[i + 1].text)) {
                str += ' ' + data[i + 1].text;
                out.push(str);
            }
        }
    }
    return out;
}

function sanitize(data) {
    for (var i = 0; i < data.length; ++i) {
        var str = data[i].text;
        var regex = /(<([^>]+)>)/ig;
        str = str.replace(regex, "");
        data[i].text = str;
    }
    return data;
}

function movieTimeFromSrtTime(strTime) {
    // '00:41:56,520'

    var h = strTime.substr(0, 2) * 60 * 60;
    var m = strTime.substr(3, 2) * 60;
    var s = strTime.substr(6, 2) * 1;

    return s + m + h;
}

var delta = 0;
function generateNext() {
    console.log('Starting Frame ' + CURRENT + ' / ' + BUFFER.length);

    CURRENT_FRAME = BUFFER[CURRENT];
    
    var st = movieTimeFromSrtTime(CURRENT_FRAME.startTime);
    var et = movieTimeFromSrtTime(CURRENT_FRAME.endTime);



    st -= 1.0;
    if (st < 0) {
	st = 0;
    }
    et += 1.0;
    console.log('Subset Length' , et - st);
    var i = 0;
    var fb = [];
    var d = (et - st) / FRAMES_PER_SUBTITLES;
    delta = d;
    console.log(delta);
    while (i < FRAMES_PER_SUBTITLES) {
	var time = st + d * i + 0.00001;
	fb.push(new String(time));
	++i;
    }

    var proc = new ffmpeg({ source: MOVIE})
	.withSize(WIDTH + 'x' + HEIGHT)
	.takeScreenshots({
	    count: FRAMES_PER_SUBTITLES,
	    timemarks: fb
	    ,
	    filename: 'screenshot' + CURRENT + '_%i'
	}, TARGET_DIR, function(err, filenames) {
	    if (err) {console.log(err);}
	    console.log('screenshots ok!');
            CURRENT_FILES = filenames;
	    generateAllSubtitles();

	});
}

/**
   convert -background transparent -font Helvetica -pointsize 30 -fill white -size 600x  -gravity Center -stroke black -strokewidth 1 caption:'Hsata la visita babidta. LOrem PSum psum it sum'  new.png
*/

var SUB_GENERATED = 0;
function generateSubtitle(target, str) {
    im.convert(['-background', 'transparent', '-font', 'Arial', '-pointsize', '35', '-fill', 'white', '-size', WIDTH + 'x', '-gravity', 'Center', '-stroke', 'black', '-strokewidth', '1.5', 'caption:' + str , target], 
	       function(err, stdout){
		   if (err) {console.log(err);}
		   mergeWaterMark();
	       });
}

var FUSIONED_WATERMARKS = 0;
function mergeWaterMark() {
    FUSIONED_WATERMARKS = 0;
    var i = 0;
    while (i < CURRENT_FILES.length) {
	//   console.log(TARGET_DIR + CURRENT_FILES[i]);
	im.convert([TARGET_DIR + CURRENT_FILES[i],
                    './movieToGif/watermark.png',
                    '-gravity', 'west',
                    '-composite',  TARGET_DIR + CURRENT_FILES[i]
		   ], function(err, stdout) {
		       if (err) {
			   console.log(err);
		       }
		       FUSIONED_WATERMARKS++;
		       if (FUSIONED_WATERMARKS == FRAMES_PER_SUBTITLES) {
			   mergeSubtitle();
		       }
		   });
	++i;
    }
};

//  sudo convert frame0_00.png srt0.png -gravity south -composite t.png
var FUSIONED_SUBTITLES = 0;
function mergeSubtitle() {
    FUSIONED_SUBTITLES = 0;
    var i = 0;
    while (i < CURRENT_FILES.length) {
	//   console.log(TARGET_DIR + CURRENT_FILES[i]);
        im.convert([TARGET_DIR + CURRENT_FILES[i],
                    TARGET_DIR + 'srt' + CURRENT + '.png',
                    '-gravity', 'south',
                    '-composite',  TARGET_DIR + CURRENT_FILES[i]
		   ], function(err, stdout) {
		       if (err) {
			   console.log(err);
		       }
		       FUSIONED_SUBTITLES++;
		       if (FUSIONED_SUBTITLES == FRAMES_PER_SUBTITLES) {
			   generateAPNG(CURRENT_FILES);
		       }
		   });
        ++i;
    }
}


function generateAllSubtitles() {
    console.log('generateTheSub');
    SUB_GENERATED = 0;
    generateSubtitle(TARGET_DIR + 'srt' + CURRENT + '.png', BUFFER[CURRENT].text);
}

var FILE_GENERATED = 0;
function generateAPNG(filenames) {
    console.log('generateThePNG');
    FILE_GENERATED = 0;
    var i = 0;
    while (i < filenames.length) {
	var numName = i;
	if (numName < 10) {
	    numName = '0' + numName;
	}
	gm(TARGET_DIR + filenames[i])
	    .noProfile()
	    .write(TARGET_DIR + 'frame' + CURRENT + '_' +numName +  '.png', function (err) {
		if (err) console.log('gm', err);
		//  console.log(err);
		FILE_GENERATED++;
		if (FILE_GENERATED === FRAMES_PER_SUBTITLES) {
		    generatetheGif();
		}
	    });
	++i;
    }
}

function generatetheGif() {
    console.log('generateTheGif');
    var encoder = new GIFEncoder(WIDTH, HEIGHT);

    pngFileStream(TARGET_DIR + '/frame' + CURRENT +'_*.png')
	.pipe(encoder.createWriteStream({ repeat: 0, delay: delta * 1000 | 0, quality: 3 }))
	.pipe(fs.createWriteStream('./movieToGif/out/' + MOVIE_NAME + '_' + (CURRENT + 1) + '.png'));


    var is = fs.createReadStream(TARGET_DIR + '/frame' + CURRENT +'_3.png');
    var os = fs.createWriteStream('./movieToGif/out/' + MOVIE_NAME + '_' + (CURRENT + 1) + '.png');

    util.pump(is, os, function() {
        fs.unlinkSync('source_file');
    });


    ++CURRENT;
    console.log('Generate Frame number : ' + CURRENT);

    indexAGif(CURRENT_FRAME.text, MOVIE_NAME + '_' + (CURRENT));
    if (CURRENT < BUFFER.length) {
	generateNext();
    }
}

function indexAGif(srt, gif) {
    elasticclient.create({
	index: 'srt',
	type: 'srt',
	id: gif,
	body: {
	    srt: srt,
	    movie: MOVIE_NAME,
        gif_name : gif +'.gif',
	    frame_name : gif +'.png',
	}
    }, function (err, response) {
	if (err) {
	    console.log('indexation : ', err)
	}
    });

}

var argv = minimist(process.argv.slice(2));

MOVIE_NAME = argv.name;
SRT = argv.srt;
MOVIE = argv.movie;

if (argv.from) {
    CURRENT = argv.from;
}

TARGET_DIR = '/mnt/ramdisk/frames/' + MOVIE_NAME + '/';

try {
    var stats = fs.statSync(TARGET_DIR);

    console.log('stats:', stats);

    if (!stats || !stats.isDirectory()) {
	fs.mkdirSync(TARGET_DIR);
    }
} catch (e) {
    console.log(TARGET_DIR + ': no such file or directory, creating...');

    fs.mkdirSync(TARGET_DIR);
}

generateGif();
