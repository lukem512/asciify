(function() {
  // The width and height of the captured photo. We will set the
  // width to the value defined here, but the height will be
  // calculated based on the aspect ratio of the input stream.

  const width = 320;    // We will scale the photo width to this
  let height = 0;       // This will be computed based on the input stream

  // |streaming| indicates whether or not we're currently streaming
  // video from the camera. Obviously, we start at false.

  let streaming = false;

  // |capturing| indicates whether we wish to capture camera data.

  let capturing = false;

  // The various HTML elements we need to configure or control. These
  // will be set by the startup() function.

  let video = null;
  let canvas = null;
  let photo = null;
  let ascii = null;

  function startup() {
    console.log('Starting...');

    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    photo = document.getElementById('photo');
    ascii = document.getElementById('ascii');
    
    clear();

    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        video.srcObject = stream;
        video.play();
        startCapture();
      })
      .catch(err => {
        console.error(`An error occured: ${err}`);
      });

    video.addEventListener('canplay', function(ev){
      if (!streaming) {
        height = video.videoHeight / (video.videoWidth/width);

        // Firefox currently has a bug where the height can't be read from
        // the video, so we will make assumptions if this happens.

        if (isNaN(height)) {
          height = width / (4/3);
        }

        video.setAttribute('width', width);
        video.setAttribute('height', height);
        canvas.setAttribute('width', width);
        canvas.setAttribute('height', height);
        streaming = true;
      }
    }, false);
  }

  // Start the video capture loop.
  // The framerate can be set using the |ms| parameter.

  function startCapture(ms) {
    capturing = true;
    captureLoop(ms)
  }

  function captureLoop(ms = 100) {
    window.setTimeout(function () {
      if (capturing) {
        frame();
        captureLoop(ms);
      }
    }, ms);
  }

  // Stop the video capture loop.

  function stopCapture() {
    capturing = false;
  }

  // Frame rate to millisecond conversion.

  function fr2ms(fr) {
    return math.ceil(1000 / fr);
  }

  // Fill the photo with an indication that none has been
  // captured.

  function clear() {
    const context = canvas.getContext('2d');
    context.fillStyle = "#AAA";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const data = canvas.toDataURL('image/png');
    photo.setAttribute('src', data);
  }

  // Capture a photo by fetching the current contents of the video
  // and drawing it into a canvas, then converting that to a PNG
  // format data URL. By drawing it on an offscreen canvas and then
  // drawing that to the screen, we can change its size and/or apply
  // other changes before drawing it.

  function frame() {
    const context = canvas.getContext('2d');
    if (width && height) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      grayscale(0, 0, canvas.width, canvas.height);
      // pixelate(0, 0, canvas.width, canvas.height);
      // const data = canvas.toDataURL('image/png');
      // photo.setAttribute('src', data);

      const asciiStr = asciify(0, 0, canvas.width, canvas.height);
      const rows = asciiStr.split('\n');
      ascii.setAttribute('rows', rows.length);
      ascii.setAttribute('cols', rows[0].split('').length)
      ascii.value = asciiStr;
    } else {
      clear();
    }
  }

  // Convert the image data to grayscale using a weighted average.

  function grayscale(x, y, width, height) {
    const context = canvas.getContext('2d');
    let frame = context.getImageData(x, y, width, height);
    for (let i = 0; i < frame.data.length; i += 4) {
      const avg = Math.round(
        ((0.299 * frame.data[i]) +
        (0.587 * frame.data[i + 1]) +
        (0.114 * frame.data[i + 2])) / 3
      );
      frame = putPixel(frame, i, {r: avg, g: avg, b: avg})
    }
    context.putImageData(frame, x, y);
  }

  // Retrieve the average colour for a region

  function getAverageColour(x, y, width, height) {
    const context = canvas.getContext('2d');
    let frame = context.getImageData(x, y, width, height);
    let sum = {};
    for (let i = 0; i < frame.data.length; i += 4) {
      sum.r = sum.r + frame.data[i] || frame.data[i];
      sum.g = sum.g + frame.data[i + 1] || frame.data[i + 1];
      sum.b = sum.b + frame.data[i + 2] || frame.data[i + 2];
    }
    const count = frame.data.length / 4;
    return Math.round(
      ((sum.r / count) + (sum.g / count) + (sum.b / count)) / 3
    );
  }

  // Pixelate the image to a given size

  function pixelate(left, top, width, height, xStep = 5, yStep = 5) {
    const context = canvas.getContext('2d');
    for (let y = 0; y < height; y += yStep) {
      for (let x = 0; x < width; x += xStep) {
        const avg = getAverageColour(left + x, top + y, xStep, yStep);
        context.beginPath();
        context.rect(left + x, top + y, xStep, yStep);
        context.fillStyle = `rgb(${avg}, ${avg}, ${avg})`;
        context.fill();
      }
    }
  }

  const SHADES = ['@', 'H', '+', '-', '.', ' '];

  function asciify(left, top, width, height, xStep = 5, yStep = 5) {
    const avg = [];
    for (let y = 0; y < height; y += yStep) {
      const ypos = y * height;
      for (let x = 0; x < width; x += xStep) {
        avg[ypos + x] = getAverageColour(left + x, top + y, xStep, yStep);
      }
    }

    const bounds = avg.reduce(function(obj, cur) {
      return {
        max: Math.max(obj.max, cur) || cur,
        min: Math.min(obj.min, cur) || cur
      };
    }, {});

    const opts = {
      top: SHADES.length - 1,
      bottom: 0,
      min: bounds.min,
      max: bounds.max
    };

    let str = '';
    for (let y = 0; y < height; y += yStep) {
      const ypos = y * height;
      for (let x = 0; x < width; x += xStep) {
        const shade = Math.round(scale(avg[ypos + x], opts));
        str += SHADES[shade];
      }
      str += '\n';
    }

    return str;
  }

  function putPixel(frame, i, {r, g, b}) {
    frame.data[i] = r;
    frame.data[i + 1] = g;
    frame.data[i + 2] = b;
    return frame;
  }

  function scale(x, {top, bottom, min, max}) {
    return (((top - bottom) * (x - min)) / (max - min)) + bottom;
  }

  // Set up our event listener to run the startup process
  // once loading is complete.
  window.addEventListener('load', startup, false);
})();
