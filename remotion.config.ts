import {Config} from '@remotion/cli/config';

// YouTube-ready master: 2560x1440 @ 60fps, H.264 High, 4:2:0, BT.709, AAC.
Config.setOverwriteOutput(true);
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setColorSpace('bt709');
Config.setVideoImageFormat('png'); // lossless frames into the encoder (jpeg adds a 2nd lossy pass)
Config.setCrf(14); // visually lossless; lower = bigger file
Config.setX264Preset('slow'); // better compression per bit, slower render
Config.setAudioCodec('aac');
Config.setAudioBitrate('384k');
Config.setConcurrency(null); // let Remotion pick; lower it if you run out of RAM
