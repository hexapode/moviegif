var fs = require('fs');
var path = require('path');
var async = require('async');
var parser = require('subtitles-parser');
var ffmpeg = require('fluent-ffmpeg');
var GIFEncoder = require('gifencoder');
var pngFileStream = require('png-file-stream');
var gm = require('gm');
var im = require('imagemagick');
var minimist = require('minimist');
var util = require('util');
var cp =require('child_process');




var elasticsearch = require('elasticsearch');
var elasticclient = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});

var MOVIE_NAME;// = 'arrow';
var SRT;// = './movieToGif/movies/arrow.srt';
var MOVIE;// = './movieToGif/movies/arrow.mp4';
var TARGET_DIR = './movieToGif/';
var MOVIE_BEAUTY = '';

var SUBTITLES = [];
var CURRENT = 0;
var MAX;
var CURRENT_FRAME = 0;
var CURRENT_FILES = 0;
var FRAMES_PER_SUBTITLES = 30;
var FRAME_RATE = 8;

var WIDTH = 480;
var HEIGHT = 240;

function getSrtObject() {
    var srt = fs.readFileSync(SRT);
    var data = parser.fromSrt(srt.toString());
    return data;
}

function generateGif() {
    var data = getSrtObject();

    console.log('Str ok');

    data = sanitize(data);

    data = fusion(data);
    SUBTITLES = data;

    generateNext();
}


function hasPunctuation(str) {
    console.log(str)

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
        if (hasPunctuation(str.text)) {

        }
        else {
            if (str.text.length > 150) {

            }
            else if (data[i + 1] && hasPunctuation(data[i + 1].text)) {
                str.text += ' ' + data[i + 1].text;
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
	regex = /(\[([^>]+)\])/ig;
	str = str.replace(regex, "");
	str = str.replace(/\n/g, " ");
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

/*
  if (err) {console.error(err);}
  console.log('screenshots ok!');
  CURRENT_FILES = filenames;
  generateAllSubtitles();
*/
//  mplayer  -ss 00:10:00 -frames 1 -vo png,outdir=./,prefix=frameNo,z=0 -ao null ./arrow.mp4
//  mplayer -ss 61.33334333333334 -frames 1 -vo png,outdir=./movieToGif/frames/Arrow/,prefix=Test,z=0 -ao null ./movieToGif/movies/arrow.mp4

//time ffmpeg -async 1 -ss 00:00:10.001 -i James.Bond.Quantum.of.Solace.2008.720p.BRrip.x264.YIFY.mp4 -t 3 -s 400x240 -r 10  x%d.jp

function takeAllScreenShoot(startTime, duration) {
    /*
      var mplayerCommand = 'mplayer -ss ' + offset +
      ' -frames 1' +
      ' -vf scale=' + WIDTH + ':' + HEIGHT +
      ' -vo png:outdir=' + TARGET_DIR + ',z=0' +
      ' -ao null ' +
      MOVIE;
    */

    var ffmpegCommand = 'ffmpeg -ss ' + startTime
        + ' -i ' + MOVIE
        + ' -t ' + duration
        + ' -s ' + WIDTH + 'x' + HEIGHT
        + ' -r ' + FRAME_RATE
        + ' ' + TARGET_DIR + 'screenshot_' + MOVIE_NAME + '_' + CURRENT + '_%d.jpg';

    console.log(ffmpegCommand);
    console.log(CURRENT_FILES);

    var proc = cp.exec(
        ffmpegCommand,
        function(err) {
            console.log('shot here');
            console.error(err);

            generateAllSubtitles();
        });
}

var delta = 0;
function generateNext() {
    console.log('Starting Subtitle ' + CURRENT + ' / ' + SUBTITLES.length);

    CURRENT_FRAME = SUBTITLES[CURRENT];

    var st = movieTimeFromSrtTime(CURRENT_FRAME.startTime);
    var et = movieTimeFromSrtTime(CURRENT_FRAME.endTime);

    /**
     * Extract timings from SRT
     */
    st -= 1.0;
    if (st < 0) {
        st = 0;
    }
    et += 1.0;

    console.log('Subtitle Length' , et - st);

    var i = 0;
    var fb = [];
    FRAMES_PER_SUBTITLES = (et - st) * FRAME_RATE;

    console.log('FRAMES COUNT', FRAMES_PER_SUBTITLES);

    var d = (et - st) / FRAMES_PER_SUBTITLES;
    delta = d;

    console.log(delta);

    CURRENT_FILES = [];
    var i = 0;
    while (i < FRAMES_PER_SUBTITLES) {
        CURRENT_FILES.push(TARGET_DIR + 'screenshot_' + MOVIE_NAME + '_' + CURRENT + '_' + (i+1) + '.jpg');
        ++i;
    }
    takeAllScreenShoot(st, et - st);
}

/**
   convert -background transparent -font Helvetica -pointsize 30 -fill white -size 600x  -gravity Center -stroke black -strokewidth 1 caption:'Hsata la visita babidta. LOrem PSum psum it sum'  new.png
*/

var SUB_GENERATED = 0;
function generateSubtitle(target, str) {
    var size = 32;
    var strokeSize = "1.8";
    if (str.length > 30) {
        size = 28;
        strokeSize = "1.2";
    }
    if (str.length > 60) {
        size = 26;
        strokeSize = "1.0";
    }
    im.convert([
        '-background', 'transparent',
        '-font', 'Helvetica Bold',
        '-pointsize', size,
        '-fill', '#ffffff',
        '-size', WIDTH + 'x',
        '-gravity', 'Center',
        '-stroke', '#111111',
        '-strokewidth', strokeSize,
        'caption:' + str , target
    ], function(err, stdout) {
        if (err) return console.error(err);

        mergeWaterMark();
    });
}

function mergeWaterMark() {
    console.log('watermarks');

    async.each(CURRENT_FILES, function (file, callback) {
        im.convert([
            file,
            './movieToGif/watermark.png',
            '-gravity', 'west',
            '-composite', file
        ], callback);
    }, function (err) {
        if (err) return console.error('mergeWaterMark, error:', err);

        mergeSubtitle();
    });
};

//  sudo convert frame0_00.png srt0.png -gravity south -composite t.png
var FUSIONED_SUBTITLES = 0;
function mergeSubtitle() {
    console.log('merge subs');

    FUSIONED_SUBTITLES = 0;
    var i = 0;
    while (i < CURRENT_FILES.length) {
        im.convert([CURRENT_FILES[i],
                    TARGET_DIR + 'srt' + CURRENT + '.png',
                    '-gravity', 'south',
                    '-composite', CURRENT_FILES[i]
                   ], function(err, stdout) {
                       if (err) return console.error('mergeSubtitle, error:', err);

                       FUSIONED_SUBTITLES++;
                       if (FUSIONED_SUBTITLES == FRAMES_PER_SUBTITLES) {
                           convertJPGsToPNGs(CURRENT_FILES);
                       }
                   });
        ++i;
    }
}

function generateAllSubtitles() {
    console.log('generateTheSub');

    SUB_GENERATED = 0;
    generateSubtitle(TARGET_DIR + 'srt' + CURRENT + '.png', SUBTITLES[CURRENT].text);
}

var CURRENT_FRAMES;
function convertJPGsToPNGs(filenames) {
    console.log('convertJPGsToPNGs');

    var i = 0;
    var frameFile = '';

    async.mapSeries(filenames, function (filename, callback) {
        var numName = (i < 10 ? '0' : '') + i;

        frameFile = TARGET_DIR + 'frame' + CURRENT + '_' + numName + '.png';

        gm(filename)
            .noProfile()
            .write(frameFile, function (err) {
                if (err) return callback(err);

                callback(null, frameFile);
            });
        ++i;
    }, function (err, frameFiles) {
        if (err) return console.error('convertJPGsToPNGs, error:', err);

        CURRENT_FRAMES = frameFiles;

        generateTheGif();
    });
}

function generateTheGif() {
    console.log('generateTheGif');

    var encoder = new GIFEncoder(WIDTH, HEIGHT);

    //var frames = CURRENT_FRAMES.join(' ');
    var frames = TARGET_DIR + 'frame' + CURRENT + '_??.png';

    console.log('for pattern:', frames);

    pngFileStream(frames)
        .pipe(encoder.createWriteStream({ repeat: 0, delay: 1000 / FRAME_RATE | 0, quality: 3 }))
        .pipe(fs.createWriteStream('./movieToGif/out/' + MOVIE_NAME + '_' + (CURRENT + 1) + '.gif'));


    var is = fs.createReadStream(TARGET_DIR + 'frame' + CURRENT +'_15.png');
    var os = fs.createWriteStream('./movieToGif/out/' + MOVIE_NAME + '_' + (CURRENT + 1) + '.png');

    util.pump(is, os, function() {});


    ++CURRENT;
    console.log('Generate Frame number : ' + CURRENT);

    indexAGif(CURRENT_FRAME.text, MOVIE_NAME + '_' + (CURRENT));

    if (false) {
	var files = fs.readdirSync(TARGET_DIR);
	files = files
	    .map(function (file) { return TARGET_DIR + file; });
	console.log(files);
	files.map(fs.unlinkSync);
    }

    if (MAX) {
        if (CURRENT < MAX) {
            generateNext();
        }
    } else if (CURRENT < SUBTITLES.length) {
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
            movie_name : MOVIE_BEAUTY
	}
    }, function (err, response) {
        if (err) return console.error('indexation, error:', err);
    });

}

var argv = minimist(process.argv.slice(2));

MOVIE_NAME = argv.name;
SRT = argv.srt;
MOVIE = argv.movie;
MOVIE_BEAUTY = argv.beauty;

if (!MOVIE_BEAUTY) {
    console.log('--beauty "Beauty name" Require!');
}

if (argv.from) {
    CURRENT = argv.from;
}
if (argv.to) {
    MAX = argv.to;
}

// TARGET_DIR = '/mnt/ramdisk/frames/' + MOVIE_NAME + '/';
TARGET_DIR = './movieToGif/frames/' + MOVIE_NAME + '/';

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

console.log('starting Generation');

generateGif();
