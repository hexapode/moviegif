var fs = require('fs');
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
var TARGET_DIR = './movieToGif';

var BUFFER = [];
var CURRENT = 0;
var MAX;
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
    console.log('Str ok');
    data = sanitize(data);

    data = fusion(data);
    BUFFER = data;

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
if (err) {console.log(err);}
      console.log('screenshots ok!');
            CURRENT_FILES = filenames;
      generateAllSubtitles();
 */
//  mplayer  -ss 00:10:00 -frames 1 -vo png,outdir=./,prefix=frameNo,z=0 -ao null ./arrow.mp4
//  mplayer -ss 61.33334333333334 -frames 1 -vo png,outdir=./movieToGif/frames/Arrow/,prefix=Test,z=0 -ao null ./movieToGif/movies/arrow.mp4

function takeAScreenShoot() {
    console.log('taking screen', SCREEN_ORDER_INDEX);
    var offset = SCREEN_ORDER_BUFFER[SCREEN_ORDER_INDEX].time;
    var filename = SCREEN_ORDER_BUFFER[SCREEN_ORDER_INDEX].name;
    
    CURRENT_FILES.push(filename + '.png');
    var proc = cp.exec('mplayer -ss ' + offset + ' -frames 1 -vo png:outdir=' + TARGET_DIR+ ',prefix='  + filename +',z=0 -x 480 -y 240 -ao null ' + MOVIE, function(err) {
      console.log('shot herre');
      console.log(err);
      
      SCREEN_ORDER_INDEX++;
      if (SCREEN_ORDER_INDEX < SCREEN_ORDER_BUFFER.length) {
        takeAScreenShoot();
      }
      else {
        console.log('screenshots ok!');
        generateAllSubtitles();
      }
    });

  proc.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });
}


var SHOOT_GENERATED = 0;
var delta = 0;
var SCREEN_ORDER_BUFFER = [];
var SCREEN_ORDER_INDEX = 0;
function generateNext() {
    console.log('Starting Frame ' + CURRENT + ' / ' + BUFFER.length);

    CURRENT_FRAME = BUFFER[CURRENT];
    
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
    console.log('Subset Length' , et - st);
    var i = 0;
    var fb = [];
    var d = (et - st) / FRAMES_PER_SUBTITLES;
    delta = d;
    console.log(delta);

    SHOOT_GENERATED = 0;
    CURRENT_FILES = [];
    SCREEN_ORDER_BUFFER = [];
    var i = 0;
    while (i < FRAMES_PER_SUBTITLES) {
      var time = st + d * i + 0.00001;
      fb.push(time);
      SCREEN_ORDER_BUFFER.push({
        time : time,
        name : 'screenshot_' + MOVIE_NAME + '_' + CURRENT + i,
        num : i
      })
      ++i;
    }
    SCREEN_ORDER_INDEX = 0;
    takeAScreenShoot();

}

/**
   convert -background transparent -font Helvetica -pointsize 30 -fill white -size 600x  -gravity Center -stroke black -strokewidth 1 caption:'Hsata la visita babidta. LOrem PSum psum it sum'  new.png
*/

var SUB_GENERATED = 0;
function generateSubtitle(target, str) {
    var size = 35;
    var strokeSize = "1.8";
    if (str.length > 30) {
        size = 25;
  strokeSize = "1.2";
    }
    if (str.length > 60) {
        size = 20;
  strokeSize = "0.8";
    }
    im.convert([
  '-background', 'transparent',
  '-font', 'Arial',
  '-pointsize', size,
  '-fill', 'white',
  '-size', WIDTH + 'x',
  '-gravity', 'Center',
  '-stroke', 'black',
  '-strokewidth', strokeSize,
  'caption:' + str , target
    ], function(err, stdout){
  if (err) {console.log(err);}
  mergeWaterMark();
    });
}

var FUSIONED_WATERMARKS = 0;
function mergeWaterMark() {
    console.log('wattermarks');
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
    console.log('merge subs');
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
  .pipe(fs.createWriteStream('./movieToGif/out/' + MOVIE_NAME + '_' + (CURRENT + 1) + '.gif'));


    var is = fs.createReadStream(TARGET_DIR + '/frame' + CURRENT +'_15.png');
    var os = fs.createWriteStream('./movieToGif/out/' + MOVIE_NAME + '_' + (CURRENT + 1) + '.png');

    util.pump(is, os, function() {});


    ++CURRENT;
    console.log('Generate Frame number : ' + CURRENT);

    indexAGif(CURRENT_FRAME.text, MOVIE_NAME + '_' + (CURRENT));
    if (MAX) {
  if (CURRENT < MAX) {
      generateNext();
  }
    } else if (CURRENT < BUFFER.length) {
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
