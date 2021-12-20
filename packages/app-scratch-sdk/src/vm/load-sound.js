// based on https://github.com/LLK/scratch-vm/blob/146e93e4ecc41c5ff32545ff36201f82eed8084b/src/import/load-sound.js

import { splitFirst } from "scratch-vm/src/util/string-util";
import { error } from "scratch-vm/src/util/log";

/**
 * Initialize a sound from an asset asynchronously.
 * @param {!object} sound - the Scratch sound object.
 * @property {string} md5 - the MD5 and extension of the sound to be loaded.
 * @property {Buffer} data - sound data will be written here once loaded.
 * @param {!Asset} soundAsset - the asset loaded from storage.
 * @param {!Runtime} runtime - Scratch runtime, used to access the storage module.
 * @param {SoundBank} soundBank - Scratch Audio SoundBank to add sounds to.
 * @returns {!Promise} - a promise which will resolve to the sound when ready.
 */
export const loadSoundFromAsset = function (sound, soundAsset, runtime, soundBank) {
  sound.assetId = soundAsset.assetId;
  if (!runtime.audioEngine) {
    error("No audio engine present; cannot load sound asset: ", sound.md5);
    return Promise.resolve(sound);
  }
  return runtime.audioEngine
    .decodeSoundPlayer(Object.assign({}, sound, { data: soundAsset.data }))
    .then(soundPlayer => {
      if (sound.soundId) {
        const audioBuffer = runtime.audioEngine.audioBuffers[soundPlayer.id];
        delete runtime.audioEngine.audioBuffers[soundPlayer.id];
        runtime.audioEngine.audioBuffers[sound.soundId] = audioBuffer;
        soundPlayer.id = sound.soundId;
      } else {
        sound.soundId = soundPlayer.id;
      }
      // Set the sound sample rate and sample count based on the
      // the audio buffer from the audio engine since the sound
      // gets resampled by the audio engine
      const soundBuffer = soundPlayer.buffer;
      sound.rate = soundBuffer.sampleRate;
      sound.sampleCount = soundBuffer.length;

      if (soundBank !== null) {
        soundBank.addSoundPlayer(soundPlayer);
      }

      return sound;
    });
};

/**
 * Load a sound's asset into memory asynchronously.
 * @param {!object} sound - the Scratch sound object.
 * @property {string} md5 - the MD5 and extension of the sound to be loaded.
 * @property {Buffer} data - sound data will be written here once loaded.
 * @param {!Runtime} runtime - Scratch runtime, used to access the storage module.
 * @param {SoundBank} soundBank - Scratch Audio SoundBank to add sounds to.
 * @returns {!Promise} - a promise which will resolve to the sound when ready.
 */
export const loadSound = function (sound, runtime, soundBank) {
  if (!runtime.storage) {
    error("No storage module present; cannot load sound asset: ", sound.md5);
    return Promise.resolve(sound);
  }
  const idParts = splitFirst(sound.md5, ".");
  const md5 = idParts[0];
  const ext = idParts[1].toLowerCase();
  sound.dataFormat = ext;
  return (
    (sound.asset && Promise.resolve(sound.asset)) ||
    runtime.storage.load(runtime.storage.AssetType.Sound, md5, ext)
  ).then(soundAsset => {
    sound.asset = soundAsset;
    return loadSoundFromAsset(sound, soundAsset, runtime, soundBank);
  });
};
