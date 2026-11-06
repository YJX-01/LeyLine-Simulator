// Optional P0 investigation: requires ffmpeg/ffprobe on PATH and Playwright Chromium.
// No application server, network, fixture download, or persistent media files.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const directory = await mkdtemp(join(tmpdir(), 'leyline-video-probe-'));
let browser;
try {
  const file = join(directory, 'vfr.webm');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=30:duration=1',
    '-vf', 'select=eq(n\\,0)+eq(n\\,1)+eq(n\\,3)+eq(n\\,6)+eq(n\\,10)+eq(n\\,15)',
    '-fps_mode', 'vfr', '-c:v', 'libvpx', '-g', '1', file]);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', file], { encoding: 'utf8' }));
  const timestamps = probe.frames.map(frame => Number(frame.best_effort_timestamp_time));
  assert.deepEqual(timestamps, [0, 0.033, 0.1, 0.2, 0.333, 0.5]);
  // At 100 ms the next frame is 200 ms; adding a nominal 1/30 s stays in the same frame.
  const at = time => timestamps.findLast(value => value <= time);
  assert.equal(at(0.1), at(0.1 + 1 / 30));
  assert.equal(300 * Math.round(1000 / 30), 9900);
  assert.equal(Math.round(300 * 1000 / 30), 10000);
  const source = `data:video/webm;base64,${(await readFile(file)).toString('base64')}`;
  browser = await chromium.launch();
  const page = await browser.newPage();
  const observed = await page.evaluate(async source => {
    const video = document.createElement('video');
    video.muted = true;
    document.body.append(video);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Synthetic WebM decode timed out')), 5000);
      video.onloadeddata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('Synthetic WebM decode failed')); };
      video.src = source;
    });
    const samples = [];
    for (const requested of [0.1, 0.1 + 1 / 30, 0.2, 0.333, 0.5]) {
      const frame = new Promise(resolve => {
        const timer = setTimeout(() => { video.cancelVideoFrameCallback(handle); resolve(null); }, 2000);
        const handle = video.requestVideoFrameCallback((_now, metadata) => {
          clearTimeout(timer);
          resolve(metadata.mediaTime);
        });
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Synthetic WebM seek timed out')), 5000);
        video.onseeked = () => { clearTimeout(timer); resolve(); };
        video.currentTime = requested;
      });
      samples.push({ requested, currentTime: video.currentTime, presentedMediaTime: await frame });
    }
    return { requestVideoFrameCallback: typeof video.requestVideoFrameCallback === 'function',
      fastSeek: typeof video.fastSeek === 'function', samples };
  }, source);
  console.log(JSON.stringify({ browser: browser.version(), timestamps, observed }, null, 2));
  assert.equal(observed.requestVideoFrameCallback, true);
  assert.equal(observed.samples[0].presentedMediaTime, 0.1);
  assert.equal(observed.samples[1].presentedMediaTime, 0.1);
  assert.equal(observed.samples[2].presentedMediaTime, 0.2);
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
