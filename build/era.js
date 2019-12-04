/**
 * The default settings for the ERA engine.
 */
const DEFAULT_SETTINGS = {
  fps: false,
  mouse_sensitivity: 50,
  shaders: true,
  volume: 50,
  controls: {},
  movement_deadzone: 0.15,
};

const SOUND_DATA = { 
  example: {
    name: 'example',
    extension: 'wav',
    volume: 0.5
  },
};

/**
 * Generates a RFC4122 version 4 compliant UUID.
 */
function createUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    var r = Math.random() * 16 | 0,
      v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}


/**
 * Extracts an array of meshes present in an object hierarchy.
 * @param {Object3D} object The root object from which to search.
 * @param {string} materialFilter The name of a material we want to search for.
 * @param {boolean} filterOut True if the set of meshes should exclude the
 *                  matching material name.
 */
function extractMeshes(object, materialFilter, filterOut = true) {
  let meshes = [];
  if (object.type == 'Mesh') {
    if (materialFilter &&
      ((filterOut && object.material.name.indexOf(materialFilter) < 0) ||
        (!filterOut && object.material.name.indexOf(materialFilter) > -1))) {
      meshes.push(object);
    } else if (!materialFilter) {
      meshes.push(object);
    }
  }
  object.children.forEach((child) => {
    const childrenMeshes = extractMeshes(child, materialFilter, filterOut);
    meshes = meshes.concat(childrenMeshes);
  });
  return meshes;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Loads a JSON from the given file path.
 * @param {string} path 
 * @return {Promise<Object>} Parsed JSON object.
 * @async
 */
async function loadJsonFromFile(path) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.FileLoader();
    loader.load(path, (data) => {
      resolve(JSON.parse(data));
    }, () => {}, (err) => {
      reject(err);
    });
  });
}

/**
 * Core implementation for managing events and listeners. This
 * exists out of necessity for a simple event and message system
 * for both the client and the server.
 */

let eventsInstance = null;

class Events {
  
  /**
   * Enforces singleton instance.
   */
  static get() {
    if (!eventsInstance) {
      eventsInstance = new Events();
    }
    return eventsInstance;
  }
  
  constructor() {
    // All registered listeners. Key is the event label, value is another
    // map with the listener UUID as the key, the callback function as the
    // value.
    this.registeredListeners = new Map();
    
    // Tracks which labels a listener is listening to. Used for ease of
    // removal. Key is the listener UUID, value is the event label.
    this.registeredUUIDs = new Map();
  }
  
  /**
   * Fires all event listener callbacks registered for the label
   * with the event data.
   */
  fireEvent(label, data, context) {
    const callbacks = this.registeredListeners.get(label);
    if (!callbacks)
      return false;
    callbacks.forEach((callback) => {
      if (!callback.context || callback.context == context)
        callback(data);
    });
  }
  
  /**
   * Adds an event listener for a certain label. When the event is fired,
   * the callback is called with data from the event. Returns the UUID
   * of the listener.
   */
  addListener(label, callback) {
    if (!label || !callback && typeof(callback) !== 'function') {
      return false;
    }
    // If the label has not yet been registered, do so by creating a new map
    // of listener UUIDs and callbacks.
    let listeners = this.registeredListeners.get(label);
    if (!listeners) {
      listeners = new Map();
      this.registeredListeners.set(label, listeners);
    }
    const listenerUUID = createUUID();
    listeners.set(listenerUUID, callback);
    this.registeredUUIDs.set(listenerUUID, label);
    return listenerUUID;
  }
  
  /**
   * Removes an event listener from registered listeners by its UUID.
   * Returns true if the listener is successfully deleted.
   */
  removeListener(uuid) {
    const label = this.registeredUUIDs.get(uuid);
    if (!label) {
      return false;
    }
    const listeners = this.registeredListeners.get(label);
    if (!listeners) {
      return false;
    }
    return listeners.delete(uuid);
  }
  
}

/**
 * Superclass for all custom events within the engine. Utilizes the
 * engine-specific event handling system used for both client and
 * server.
 */
class EraEvent {
  
  constructor(label, data, context) {
    this.label = label;
    this.data = data;
    // TODO: Remove "context" and provide an actual target.
    this.context = context;
  }
  
  /**
   * Fires the event to the events core.
   */
  fire() {
    Events.get().fireEvent(this.label, this.data, this.context);
  }
  
  /**
   * Creates an event listener for the given type.
   */
  static listen(label, callback) {
    Events.get().addListener(label, callback);
  }
  
}

const LABEL = 'reset';

/**
 * Engine reset event.
 */
class EngineResetEvent extends EraEvent {
  constructor() {
    super(LABEL, {});
  }
  
  /** @override */
  static listen(callback) {
    EraEvent.listen(LABEL, callback);
  }
}

/**
 * Settings changed event. Fired when settings are applied.
 */
class SettingsEvent extends EraEvent {
  
  /**
   * Takes in the new settings object.
   */
  constructor() {
    const label = 'settings';
    const data = {};
    super(label, data);
  }
  
  /** @override */
  static listen(callback) {
    EraEvent.listen('settings', callback);
  }
}

const SETTINGS_KEY = 'era_settings';

/**
 * Controls the client settings in a singleton model in local storage.
 */
class Settings {

  constructor() {
    this.settingsObject = this.initSettings();
    this.verifySettings();
  }
  
  /**
   * Gets the value of a key in the settings object.
   */
  get(key) {
    return this.settingsObject[key];
  }

  /**
   * Retrieves the settings object from local storage. If none exists, create
   * the default.
   */
  initSettings() {
    if (!localStorage.getItem(SETTINGS_KEY)) {
      this.createDefaults();
    }
    try {
      JSON.parse(localStorage.getItem(SETTINGS_KEY));
    } catch (e) {
      this.createDefaults();
    }
    return JSON.parse(localStorage.getItem(SETTINGS_KEY));
  }

  /**
   * Creates the default settings object in local storage.
   */
  createDefaults() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
  }

  /**
   * Fires the applySettings event to the event core, then saves to local
   * storage.
   */
  apply() {
    localStorage.setItem(
      SETTINGS_KEY, JSON.stringify(this.settingsObject));
    const event = new SettingsEvent(this.settingsObject);
    event.fire();
  }
  
  /**
   * Verifies that all fields in the settings are present. This is necessary
   * for updates to settings that are not present in localStorage, i.e. if a
   * new setting is added.
   */
  verifySettings() {
    let changed = false;
    for (let key in this.settingsObject) {
      // If the current key in settings no longer exists in default settings,
      // delete from local storage.
      if (DEFAULT_SETTINGS[key] === undefined) {
        delete this.settingsObject[key];
        changed = true;
      }
    }
    for (let key in DEFAULT_SETTINGS) {
      // If the current key is not in current settings, set it to the default.
      if (this.settingsObject[key] === undefined) {
        this.settingsObject[key] = DEFAULT_SETTINGS[key];
        changed = true;
      }
    }
    if(changed) {
      this.apply();
    }
  }
}

var Settings$1 = new Settings();

const CROSSFADE_TIME = 500;

/** 
 * Core implementation for all audio. Manages the loading, playback, and
 * other controls needed for in-game audio.
 */
let audioInstance = null;

class Audio {

  /**
   * Enforces a singleton audio instance.
   */
  static get() {
    if (!audioInstance) {
      audioInstance = new Audio();
    }
    return audioInstance;
  }

  constructor() {
    this.context = new AudioContext();

    // Map containing all sounds used in the engine. Key is the sound name,
    // value is the sound buffer.
    this.sounds = new Map();

    // The ambient sounds loaded.
    this.backgroundSounds = new Array();
    this.ambientEventSounds = new Array();
    
    // A map of playing sounds in order to allow stopping mid-play.
    this.playingSounds = new Map();

    this.loadSettings();
    SettingsEvent.listen(this.loadSettings.bind(this));
    EngineResetEvent.listen(this.handleEngineReset.bind(this));
  }

  /**
   * Loads all sounds specified in the sound data file.
   */
  loadSounds() {
    const promises = [];
    for (let name in SOUND_DATA) {
      const soundData = SOUND_DATA[name];
      promises.push(this.loadSound(soundData.name, soundData.extension));
    }
    return Promise.all(promises).then((sounds) => {
      sounds.forEach((sound) => this.sounds.set(sound.name, sound.buffer));
    });
  }

  /**
   * Loads an individual sound.
   */
  loadSound(name, extension) {
    const path = `assets/sounds/${name}.${extension}`;
    return this.createSoundRequest(path).then((event) => {
      return this.bufferSound(event);
    }).then((buffer) => {
      return Promise.resolve({
        name,
        buffer
      });
    });
  }
  
   /**
   * Creates and sends an HTTP GET request with type arraybuffer for sound.
   */
  createSoundRequest(path) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('GET', path, true);
      request.responseType = 'arraybuffer';
      request.addEventListener('load', (event) => {
        resolve(event);
      }, false);
      request.send();
    });
  }

  /**
   * Decodes audio data from the request response.
   */
  bufferSound(event) {
    return new Promise((resolve, reject) => {
      const request = event.target;
      this.context.decodeAudioData(request.response, (buffer) => {
        resolve(buffer);
      });
    });
  }

  /**
   * Converts an audio buffer into a Web Audio API source node.
   */
  createSourceNode(buffer) {
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.context.destination);
    return {
      source: source,
      gain: gain
    };
  }

  /**
   * Plays a sound in-game.
   */
  playSound(name, adjustVolume = 1.0) {
    const defaultSound = this.sounds.get(name);
    let buffer = defaultSound;
    if (!buffer) {
      return false;
    }
    const soundData = SOUND_DATA[name];
    const source = this.createSourceNode(buffer);
    const volRatio = this.masterVolume / this.defaultVolume;
    const dataVolume = soundData && soundData.volume ? soundData.volume : 1.0;
    const volume = volRatio * dataVolume * adjustVolume;
    source.gain.gain.value = volume;
    source.source.start(0);
    return source;
  }

  /** 
   * Stops playing a sound.
   */
  stopSound(sourceNode) {
    if (sourceNode) {
      sourceNode.source.stop();
    }
  }

  /**
   * Loads settings relevant to audio.
   */
  loadSettings() {
    this.masterVolume = Settings$1.get('volume');
    this.defaultVolume = DEFAULT_SETTINGS.volume;
  }

  /**
   * Starts the loaded ambient sound track.
   */
  startAmbientSound() {
    if (!this.backgroundSounds.length) {
      return;
    }
    this.shouldPlayAmbientSound = true;
    this.addAmbientTrack(0, this.backgroundSounds, this.ambientVolume);
    setTimeout(() => {
      this.addAmbientTrack(1, this.backgroundSounds, this.ambientVolume);
    }, 2500);
    if (this.ambientEventSounds.length) {
      this.addAmbientTrack(2, this.ambientEventSounds, .2, .2);
    }
  }

  /**
   * Stops playing ambient sound track.
   */
  stopAmbientSound() {
    this.shouldPlayAmbientSound = false;
    this.playingSounds.forEach((node) => {
      node.source.stop();
    });
    this.playingSounds.clear();
  }

  /**
   * Adds an ambient track to the specific channel. Called each time a new audio
   * clip needs to be played to continue the ambient noises.
   */
  addAmbientTrack(channel, sources, sourceVolume, randomness = 1.0) {
    if (!this.shouldPlayAmbientSound) {
      return;
    }
    // Add a randomness play factor for varied background noises. This is
    // optional, as the default randomness of 1.0 will never trigger this.
    if (Math.random() > randomness) {
      setTimeout(() => {
        this.addAmbientTrack(channel, sources, sourceVolume, randomness);
      }, 3000);
      return;
    }
    const volRatio = this.masterVolume / this.defaultVolume;
    const volume = volRatio * sourceVolume;
    shuffleArray(sources);
    let selectedBuffer = null;
    for (let source of sources) {
      if (!source.inUse) {
        selectedBuffer = source;
        break;
      }
    }
    if (!selectedBuffer) {
      return;
    }
    selectedBuffer.inUse = true;
    let currTime = this.context.currentTime;
    const node = this.createSourceNode(selectedBuffer);
    const uuid = createUUID();
    this.playingSounds.set(uuid, node);
    node.source.start(0);
    node.gain.gain.linearRampToValueAtTime(0, currTime);
    node.gain.gain.linearRampToValueAtTime(
      volume, currTime + CROSSFADE_TIME / 1000);

    // When the audio track is drawing to a close, queue up new track, fade old.
    setTimeout(() => {
      this.addAmbientTrack(channel, sources, sourceVolume, randomness);
      currTime = this.context.currentTime;
      node.gain.gain.linearRampToValueAtTime(volume, currTime);
      node.gain.gain.linearRampToValueAtTime(
        0, currTime + CROSSFADE_TIME / 1000);
    }, Math.round(node.source.buffer.duration * 1000 - CROSSFADE_TIME));

    // When audio finishes playing, mark as not in use.
    setTimeout(() => {
      selectedBuffer.inUse = false;
      this.playingSounds.delete(uuid);
    }, Math.round(node.source.buffer.duration * 1000));
  }

  /**
   * Handles an engine reset event.
   */
  handleEngineReset() {
    this.stopAmbientSound();
  }
}

/**
 * Defines the default input bindings per device. Binding id is sent over the
 * network.
 */
const Bindings = {
  BACKWARD: {
    binding_id: 0,
    keys: {
      keyboard: 83,
      controller: 'axes1',
    }
  },
  FORWARD: {
    binding_id: 5,
    keys: {
      keyboard: 87,
      controller: 'axes1',
    }
  },
  LEFT: {
    binding_id: 6,
    keys: {
      keyboard: 65,
      controller: 'axes0',
    }
  },
  RIGHT: {
    binding_id: 7,
    keys: {
      keyboard: 68,
      controller: 'axes0',
    }
  },
  SPRINT: {
    binding_id: 8,
    keys: {
      keyboard: 16,
      controller: 'button5',
    }
  },
};

const Types = {
  GAME: 'game',
  MINIMAP: 'minimap',
  BACKGROUND: 'background',
  STAGE: 'stage',
  TILE: 'tile',
};

/**
 * A pool of singleton, lazy-loaded WebGL renderers for specific uses.
 */
class RendererPool {
  constructor() {
    this.map = new Map();
    EngineResetEvent.listen(this.handleEngineReset.bind(this));
  }
  
  get(name) {
    if (name == Types.TILE) {
      return this.getOrCreateTileRenderer();
    }
    if (!this.map.has(name)) {
      return this.createRenderer(name);
    }
    return this.map.get(name);
  }

  /**
   * Creates a new renderer based on the name of the renderer.
   */
  createRenderer(name) {
    let renderer = null;
    switch (name) {
      case Types.GAME:
        renderer = this.createGameRenderer();
        break;
      case Types.STAGE:
      case Types.MINIMAP:
      case Types.BACKGROUND:
        renderer = this.createGenericRenderer();
        break;
    }
    this.map.set(name, renderer);
    return renderer;
  }
  
  /**
   * Creates the main renderer for the game.
   */
  createGameRenderer() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.gammaOutput = true;
    renderer.gammaInput = true;
    renderer.setClearColor(0x111111);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    return renderer;
  }
  
  /**
   * Creates the renderer used for face tiles.
   */
  createGenericRenderer() {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.gammaInput = true;
    renderer.gammaOutput = true;
    return renderer;
  }
  
  /**
   * Retrives a tile renderer from the pool if it exists. If not, creates a new
   * one.
   */
  getOrCreateTileRenderer() {
    if (!this.map.has(Types.TILE)) {
      this.map.set(Types.TILE, new Set());
    }
    const pool = this.map.get(Types.TILE);
    let found = null;
    pool.forEach((renderer) => {
      if (!renderer.inUse && !found) {
        found = renderer;
      }
    });
    if (!found) {
      found = this.createGenericRenderer();
      pool.add(found);
    }
    found.inUse = true;
    return found;
  }
  
  /**
   * Handles an engine reset by marking all renderers as not in use.
   */
  handleEngineReset() {
    const tilePool = this.map.get(Types.TILE);
    if (!tilePool) {
      return;
    }
    tilePool.forEach((renderer) => renderer.inUse = false);
  }
}

const rendererPool = new RendererPool();
const RendererTypes = Types;

let instance = null;

/**
 * Engine core for the game.
 */
class Engine {
  /**
   * Enforces singleton engine instance.
   */
  static get() {
    if (!instance) {
      instance = new Engine();
    }
    return instance;
  }

  constructor() {
    this.fpsEnabled = Settings$1.get('fps');
    this.started = false;
    this.rendering = false;
    this.plugins = new Set();
    SettingsEvent.listen(this.handleSettingsChange.bind(this));
  }

  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.camera;
  }

  getRenderer() {
    return this.renderer;
  }

  /**
   * Starts the engine. This is separate from the constructor as it
   * is asynchronous.
   */
  async start() {
    if (this.started) {
      this.reset();
    }
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    if (!this.renderer) {
      this.renderer = this.createRenderer();
    }
    if (this.fpsEnabled) {
      this.enableFpsCounter();
    }
    this.camera = this.createCamera();

    this.started = true;
    this.rendering = true;
    requestAnimationFrame(() => {
      this.render();
    });
  }

  /**
   * Resets the game engine to its initial state.
   */
  reset() {
    if (this.fpsEnabled) {
      this.enableFpsCounter();
    }
    // Reset all plugins.
    this.plugins.forEach((plugin) => plugin.update(timeStamp));
    new EngineResetEvent().fire();
    this.resetRender = true;
    this.clearScene();
    // TODO: Clean up reset rendering.
    if (!this.rendering) {
      this.rendering = true;
      return this.render();
    } else {
      // If still rendering, prevent the reset and use the old loop.
      this.resetRender = false;
    }
  }

  /**
   * Clears the scene.
   */
  clearScene() {
    const scene = this.scene;
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }
  }

  /**
   * The root for all tick updates in the game.
   */
  render(timeStamp) {
    this.renderer.render(this.scene, this.camera);
    TWEEN.update(timeStamp);
    if (this.rendererStats) {
      this.rendererStats.update(this.renderer);
    }
    // Update all plugins.
    this.plugins.forEach((plugin) => plugin.update(timeStamp));

    // Check if the render loop should be halted.
    if (this.resetRender) {
      this.resetRender = false;
      this.rendering = false;
      return;
    }
    // Continue the loop.
    requestAnimationFrame((time) => {
      this.render(time);
    });
  }

  /**
   * Creates the three.js renderer and sets options.
   */
  createRenderer() {
    const renderer = rendererPool.get(RendererTypes.GAME);
    const container = document.getElementById('container');
    container.appendChild(renderer.domElement);
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
    return renderer;
  }

  /**
   * Adjusts the game container and camera for the new window size.
   */
  onWindowResize(e) {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Creates the scene camera.
   */
  createCamera() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const viewAngle = 70;
    const aspect = width / height;
    const near = 1;
    const far = 1000;
    const camera = new THREE.PerspectiveCamera(viewAngle, aspect, near, far);
    camera.rotation.order = 'YXZ';
    return camera;
  }

  /**
   * Enables both FPS and renderer stats.
   */
  enableDebug() {
    this.enableFpsCounter();
    this.enableRenderStats();
  }

  disableDebug() {
    this.disableFpsCounter();
    this.disableRenderStats();
  }

  /**
   * FPS stats for development.
   */
  enableFpsCounter() {
    if (this.stats) {
      return;
    }
    this.fpsEnabled = true;
    let stats = new Stats();
    this.stats = stats;
    document.body.appendChild(stats.dom);
    let loop = () => {
      stats.update();
      if (this.fpsEnabled)
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  disableFpsCounter() {
    this.fpsEnabled = false;
    const parent = this.stats.dom.parentElement;
    if (!parent) {
      return;
    }
    parent.removeChild(this.stats.dom);
    this.stats = null;
  }

  enableRenderStats() {
    this.rendererStats = new THREEx.RendererStats();
    this.rendererStats.domElement.style.position = 'absolute';
    this.rendererStats.domElement.style.right = '0';
    this.rendererStats.domElement.style.bottom = '0';
    document.body.appendChild(this.rendererStats.domElement);
  }

  disableRenderStats() {
    document.body.removeChild(this.rendererStats.domElement);
    this.rendererStats = null;
  }

  /**
   * Loads settings relevant to the engine.
   */
  handleSettingsChange() {
    if (this.fpsEnabled != Settings$1.get('fps')) {
      if (Settings$1.get('fps')) {
        this.fpsEnabled = true;
        this.enableFpsCounter();
      } else {
        this.fpsEnabled = false;
        this.disableFpsCounter();
      }
    }
  }
  
  /**
   * Installs a plugin to receive updates on each engine loop as well as 
   * resets.
   * @param {Plugin} plugin
   */
  installPlugin(plugin) {
    this.plugins.add(plugin);
  }
}

/**
 * Base class for plugins to the engine such as audio, light, etc that can be
 * updated on each engine tick and reset gracefully.
 */
class Plugin {
  constructor() {}

  /**
   * Installs the plugin into the engine. This method should be final.
   */
  install() {
    Engine.get().installPlugin(this);
    return this;
  }

  /**
   * Resets the plugin.
   */
  reset() {
    console.warn('Plugin reset function not implemented');
  }

  /**
   * Updates the plugin at each engine tick.
   * @param {number} timestamp
   */
  update(timestamp) {
    console.warn('Plugin update function not implemented');
  }
}

let instance$1 = null;

/**
 * The controls core for the game. Input handlers are created here. Once the
 * input is received, the response is delegated to the entity in control.
 */
class Controls extends Plugin {
  /**
   * Enforces singleton controls instance.
   */
  static get() {
    if (!instance$1) {
      instance$1 = new Controls();
    }
    return instance$1;
  }

  constructor() {
    this.previousInput = {};

    this.registeredEntities = new Map();
    this.controlsEnabled = true;

    this.hasController = false;
    this.controllerListeners = [];

    document.addEventListener('keydown', e => this.setActions(e.keyCode, 1));
    document.addEventListener('keyup', e => this.setActions(e.keyCode, 0));
    document.addEventListener('mousedown', e => this.setActions(e.button, 1));
    document.addEventListener('mouseup', e => this.setActions(e.button, 0));

    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('click', this.onMouseClick.bind(this));

    window.addEventListener("gamepadconnected", this.startPollingController.bind(this));
    window.addEventListener("gamepaddisconnected", this.stopPollingController.bind(this));

    this.loadSettings();
    
    SettingsEvent.listen(this.handleSettingsChange.bind(this));
  }

  /** @override */
  reset() {
    this.registeredEntities = new Map();
    this.forcePointerLockState(undefined);
  }

  /** @override */
  update() {}

  registerBindings() {
    // Merge default bindings with custom controls
    // Stringify and parse so it's 100% certain a copy
    // Avoids editing the defaults
    this.bindings = JSON.parse(JSON.stringify(Bindings));
    for (let customBindingName of Object.keys(this.customControls)) {
      for (let device of Object.keys(this.customControls[customBindingName].keys)) {
        const customKey = this.customControls[customBindingName].keys[device];
        this.bindings[customBindingName].keys[device] = customKey;
      }
    }

    // Generate a map of keys -> actions to trigger
    this.boundActions = this.generateBoundActions(this.bindings);
  }

  /**
   * Generate a map of key codes and the actions they trigger
   * Used to send the actions over the network when the key is pressed
   */
  generateBoundActions(bindings) {
    let boundActions = {};
    for(let bindingName of Object.keys(bindings)) {
      for(let key of Object.values(bindings[bindingName].keys)) {
        const actionList = boundActions[key] || [];
        actionList.push(Bindings[bindingName].binding_id);
        boundActions[key] = actionList;
      }
    }
    return boundActions;
  }

  /**
   * Get all valid keys for the binding
   * @param {Object} binding 
   */
  getKeys(bindingName) {
    return Object.values(this.bindings[bindingName].keys);
  }

  /**
   * Get the key specifically for device
   * @param {Object} binding 
   */
  getBinding(bindingName, device) {
    return this.bindings[bindingName].keys[device];
  }

  /**
   * Universally enables all controller input.
   */
  enable() {
    this.controlsEnabled = true;
  }

  /**
   * Universally disables all controller input.
   */
  disable() {
    if (!window.engine) {
      return;
    }
    this.controlsEnabled = false;
    if (engine.getMainPlayer()) {
      engine.getMainPlayer().clearInput();
    }
  }

  /**
   * When a controller is detected, poll it
   */
  startPollingController() {
    if(!this.hasController) {
      this.hasController = true;
      this.controllerTick();
    }
  }

  /**
   * When a controller is disconnect, stop polling
   */
  stopPollingController() {
    this.hasController = false;
  }

  /**
   * Check status, send to server
   * Loop through all axes and buttons, send those with a value to the server
   * If none have a value, don't send anything.
   */
  controllerTick() {
    if(this.hasController) {
      const rawControllerInput = this.getRawControllerInput();

      // Fires an event with key and value
      // Key -> button1, axes2,..
      // Value -> Range from 0 to 1

      for(let key of Object.keys(rawControllerInput)) {
        // Used for setting controls
        Events.get().fireEvent('raw-controller-input', { key: key, value: rawControllerInput[key] });
        this.setActions(key, rawControllerInput[key], 'controller');
      }

      setTimeout(() => {
        window.requestAnimationFrame(this.controllerTick.bind(this));
      }, 5);
    }
  }

  /**
   * Name of the controller. 
   * Usually contains an identifying part such as 'Xbox'
   */
  getControllerName() {
    if(this.hasController) {
      return navigator.getGamepads()[0].id
    }
    return "";
  }

  /**
   * Checks raw input (no keybind overrides)
   * @returns {Object}
   */
  getRawControllerInput() {
    let input = {};
    if(this.hasController) {
      const controller = navigator.getGamepads()[0];

      // Check if the controller is in both deadzones.
      let isOutOfDeadzone = false;
      controller.axes.forEach((val, i) => {
        if (Math.abs(val) > this.movementDeadzone) {
          isOutOfDeadzone = true;
        }
      });


      for(let i = 0; i < controller.axes.length; i++) {
        // REVERSE AXES (align force direction with buttons)
        let val = -controller.axes[i];
        val = isOutOfDeadzone ? val : 0;
        input[`axes${i}`] = val;
      }

      for(let i = 0; i < controller.buttons.length; i++) {
        let val = controller.buttons[i].value;
        val = Math.abs(val) > this.movementDeadzone ? val : 0;
        input[`button${i}`] = val;
      }

      for(let key of Object.keys(input)) {
        // Only send 0 if the one before that wasn't 0
        const previousHadValue = this.previousInput[key] && this.previousInput[key] !== 0;
        if(input[key] === 0 && !previousHadValue) {
          delete input[key];
        }
      }
    }
    this.previousInput = input;
    return input;
  }

  /**
   * Handles the mouse click event. Separate from mouse down and up.
   */
  onMouseClick(e) {
    if (window.engine && engine.renderer &&
        e.target == engine.renderer.domElement)
      this.requestPointerLock();
  }

  /**
   * Requests pointer lock on the renderer canvas.
   */
  requestPointerLock() {
    if (this.pointerLockState === false) {
      return;
    }
    if (!window.engine || !window.engine.renderer) {
      return;
    }
    engine.renderer.domElement.requestPointerLock();
  }

  /**
   * Exits pointer lock.
   */
  exitPointerLock() {
    if (this.pointerLockState === true) {
      return;
    }
    document.exitPointerLock();
  }

  /**
   * Forces the pointer lock state. This is used for things like end-game
   * screens or other non-game screens.
   */
  forcePointerLockState(state) {
    this.pointerLockState = state;
    switch (state) {
      case true:
        this.requestPointerLock();
        break;
      case false:
        this.exitPointerLock();
        break;
    }
  }

  /**
   * Get the actions that should be performed if the 
   * following key is pressed
   * @param {Number | String} key 
   */
  getActionList(key) {
    return this.boundActions[key] || []
  }

  /**
   * Set the actions values controlled by the specified key
   * @param {String | Number} key 
   * @param {Number} value
   * @param {String=} inputDevice defaults to keyboard
   */
  setActions(key, value, inputDevice = 'keyboard') {
    if (!this.controlsEnabled) {
      return;
    }
    // Set all actions for all registered entities
    const actionList = this.getActionList(key);
    for(let action of actionList) {
      this.registeredEntities.forEach((entity) => {
        entity.inputDevice = inputDevice;
        entity.setAction(action, value);
      });
    }
  }

  /**
   * Handles and delegates mouse movement events.
   */
  onMouseMove(e) {
    if (!this.controlsEnabled) {
      return;
    }
    this.registeredEntities.forEach((entity) => {
      entity.setMouseMovement(e.movementX, e.movementY);
    });
  }

  /**
   * Registers an entity to receive controller input.
   */
  registerEntity(entity) {
    if (!entity || !entity.actions) {
      console.error('Must pass in an entity');
    }
    this.registeredEntities.set(entity.uuid, entity);
  }

  /**
   * Unregisters an entity from receiving controller input.
   */
  unregisterEntity(entity) {
    if (!entity || !entity.actions) {
      console.error('Must pass in an entity');
    }
    this.registeredEntities.delete(entity.uuid);
    entity.clearInput();
  }

  /**
   * Loads settings.
   */
  loadSettings() {
    this.movementDeadzone = Settings$1.get('movement_deadzone');
    this.customControls = Settings$1.get('controls');
    this.overrideControls = Settings$1.get('overrides');
    this.registerBindings();
  }
}

let instance$2 = null;

/**
 * Core implementation for loading 3D models for use in-game.
 */
class Models {

  /**
   * Enforces a singleton instance of Models.
   * @returns {Models}
   */
  static get() {
    if (!instance$2) {
      instance$2 = new Models();
    }
    return instance$2;
  }

  constructor() {
    // Stores all models. Key is the model name, value is the
    // model mesh.
    this.storage = new Map();
  }

  /**
   * Loads all models described from the provided file path. The file should
   * be a JSON file. Follow the example at /src/data/models.json.
   * @param {string} filePath
   * @async
   */
  async loadAllFromFile(filePath) {
    if (!filePath) {
      return;
    }
    // Load JSON file with all models and options.
    let allModelData;
    try {
      allModelData = await loadJsonFromFile(filePath);
    } catch (e) {
      throw new Error(e);
    }
    // Extract the directory from the file path, use for loading models.
    const directory = filePath.substr(0, filePath.lastIndexOf('/') + 1);
    const promises = new Array();
    for (let name in allModelData) {
      const options = allModelData[name];
      promises.push(this.loadModel(directory, name, options));
    }
    return Promise.all(promises);
  }

  /**
   * Load the model from file and places it into model storage. Uses the glTF
   * file format and loader.
   * @param {string} path
   * @param {Object} options
   * @async
   */
  async loadModel(directory, name, options) {
    // TODO: Handle different model file types.
    const path = `${directory}${name}.gltf`;
    return new Promise((resolve) => {
      const loader = new THREE.GLTFLoader();
      loader.load(path, (gltf) => {
        if (options.scale) {
          gltf.scene.scale.setScalar(options.scale);
        }
        if (options.side == 2) {
          extractMeshes(gltf.scene)
            .forEach((mesh) => mesh.material.side = THREE.DoubleSide);
        }
        this.storage.set(name, gltf.scene);
        resolve();
      }, () => {}, (err) => {
        throw new Error(err);
      });
    });
  }

  /**
   * Creates a clone of a model from storage.
   * @param {string} name
   * @return {THREE.Object3D}
   */
  createModel(name) {
    if (!this.storage.has(name)) {
      return null;
    }
    return this.storage.get(name).clone();
  }
}

/**
 * Class for creating contact listeners.
 */
class EraContactListener {
  constructor() {
    // A registry of shape and body contact callbacks.
    this.contactCallbacks = new Map();
  }

  /** 
   * Registers a new callback.
   */
  registerHandler(fixture, handler) {
    this.contactCallbacks.set(fixture, handler);
  }

  /** @override */
  BeginContact(contact) {
    const event = {
      type: 'begin',
      contact
    };
    this.determineCallbacks(contact, event);
    
  }

  /** @override */
  EndContact(contact) {
    const event = {
      type: 'end',
      contact
    };
    this.determineCallbacks(contact, event);
  }

  /** @override */
  PreSolve(contact, oldManifold) {}

  /** @override */
  PostSolve(contact, contactImpulse) {
    const event = {
      type: 'postsolve',
      contact,
      contactImpulse
    };
    this.determineCallbacks(contact, event); 
  }

  /**
   * Determines if any callbacks should be made.
   */
  determineCallbacks(contact, event) {
    const callbackA = this.contactCallbacks.get(contact.GetFixtureA());
    if (callbackA) {
      callbackA(event);
    }
    const callbackB = this.contactCallbacks.get(contact.GetFixtureB());
    if (callbackB) {
      callbackB(event);
    }
  }
}

const velocityIterations = 8;
const positionIterations = 3;

let instance$3 = null;

/**
 * Core implementation for managing the game's physics. The
 * actual physics engine is provided by box2d.
 */
class Physics extends Plugin {
  /**
   * Enforces singleton physics instance.
   */
  static get() {
    if (!instance$3) {
      instance$3 = new Physics();
    }
    return instance$3;
  }

  constructor() {
    super();
    this.registeredEntities = new Map();
    this.world = this.createWorld();
    this.lastTime = performance.now();
    this.physicalMaterials = new Map();
    this.contactMaterials = new Map();
    this.stepsPerSecond = 120;

    // A registry of shape and body contact callbacks.
    this.pairCallbacks = new Map();
  }

  /** @override */
  reset() {
    this.terminate();
    // TODO: Clean up physics bodies.
  }

  /** @override */
  update(forcedTime) {
    const currTime = performance.now();
    let delta = (currTime - this.lastTime) / 1000;
    this.lastTime = currTime;
    if (delta <= 0) {
      return;
    }
    this.world.Step(delta, velocityIterations, positionIterations);
    this.updateEntities(delta);
  }

  getWorld() {
    return this.world;
  }

  /**
   * Instantiates the physics world.
   */
  createWorld() {
    const world = new box2d.b2World(new box2d.b2Vec2(0.0, 0.0));
    this.contactListener = new EraContactListener();
    world.SetContactListener(this.contactListener);
    return world;
  }

  /**
   * Iterates through all registered entities and updates them.
   */
  updateEntities(delta) {
    this.registeredEntities.forEach((entity) => {
      entity.update(delta);
    });
  }

  /**
   * Registers a fixture for contact event handling.
   */
  registerContactHandler(fixture, handler) {
    if (!this.contactListener) {
      console.warn('No contact listener installed!');
      return;
    }
    this.contactListener.registerHandler(fixture, handler);
  }

  /**
   * Registers an entity to partake in physics simulations.
   */
  registerEntity(entity) {
    if (!entity || !entity.physicsObject) {
      console.error('Must pass in an entity');
    }
    this.registeredEntities.set(entity.uuid, entity);
  }

  /**
   * Unregisters an entity from partaking in physics simulations.
   */
  unregisterEntity(entity) {
    if (!entity || !entity.actions) {
      console.error('Must pass in an entity');
    }
    this.registeredEntities.delete(entity.uuid);
    this.world.DestroyBody(entity.physicsObject);
  }

  /**
   * Registers a component to partake in physics simulations. This
   * differs from an entity in that it is a single body unattached
   * to a mesh.
   */
  registerComponent(body) {
    // Does nothing at the moment.
  }

  /**
   * Unregisters a component to partake in physics simulations.
   */
  unregisterComponent(body) {
    this.world.DestroyBody(body);
  }

  /**
   * Ends the physics simulation. Is only called client-side.
   */
  terminate() {
    clearInterval(this.updateInterval);
    instance$3 = null;
  }
}

/**
 * Super class for all entities within the game, mostly those
 * that are updated by the physics engine.
 */
class Entity extends THREE.Object3D {

  constructor(parentGame) {
    super();
    this.uuid = createUUID();
    this.parentGame = parentGame;
    this.mesh = null;
    this.modelName = null;
    this.physicsBody = null;
    this.physicsEnabled = false;
    this.actions = {}; // Map of action -> value (0 - 1)
    this.inputDevice = 'keyboard';
    this.mouseMovement = {
      x: 0,
      y: 0
    };
    this.mouseSensitivity = 50;
    SettingsEvent.listen(this.loadSettings.bind(this));
  }

  withPhysics() {
    this.physicsEnabled = true;
    return this;
  }

  /**
   * Creates the mesh and physics object.
   */
  build() {
    if (this.modelName) {
      this.generateMesh();
    }
    if (this.physicsEnabled) {
      this.generatePhysicsBody();
    }
    return this;
  }

  /**
   * Creates the mesh for the entity, using the entity name provided.
   */
  generateMesh() {
    if (!this.modelName) {
      return console.warn('Model name not provided');
    }
    const scene = Models.get().storage.get(this.modelName).clone();
    this.mesh = scene;
    this.add(this.mesh);
    return this.mesh;
  }

  /**
   * Creates the physics object for the entity. This should be defined by each
   * entity.
   */
  generatePhysicsBody() {
    if (this.physicsEnabled) {
      return console.warn('generatePhysicsBody not implemented for entity');
    }
  }

  /**
   * Serializes the physics aspect of the entity.
   */
  serializePhysics() {
    const body = this.physicsBody;
    if (!body)
      return null;
    const precision = 4;
    return [
      [body.angularVelocity.toFixed(precision)],
      body.interpolatedPosition.map((x) => x.toFixed(precision)),
      body.velocity.map((x) => x.toFixed(precision)),
      [body.angle.toFixed(precision)],
    ];
  }

  getMesh() {
    return this.mesh;
  }

  /**
   * Clears all input registered to the entity. This is used in
   * the case controller input is removed from the entity.
   */
  clearInput() {
    this.actions = {};
    this.mouseMovement = {
      x: 0,
      y: 0
    };
    this.parentGame.sendInput(this);
  }

  /**
   * Sets an action to the specified value for the entity
   */
  setAction(action, value) {
    if (this.actions[action] && this.actions[action] === value) {
      return;
    }
    if (value !== 0) {
      this.actions[action] = value;
    } else {
      delete this.actions[action];
    }
    this.parentGame.sendInput(this);
  }

  /**
   * Returns if input bound to a specific function is present.
   */
  isKeyPressed(binding) {
    return this.actions && this.actions[binding.binding_id];
  }

  /**
   * Check the force a key is pressed with
   * @param {String} binding 
   */
  getForce(binding) {
    return this.actions[binding.binding_id] || 0;
  }

  /**
   * Sets the mouse movement vector for the entity.
   */
  setMouseMovement(x, y) {
    const ratio = this.mouseSensitivity / 50;
    if (this.enableMouseY) {
      this.mouseMovement.y = x * ratio;
      this.mouseMovement.x = y * ratio;
    } else {
      this.mouseMovement.x = x * ratio;
      this.mouseMovement.y = y * ratio;
    }
    this.parentGame.sendInput(this);
    if (!this.parentGame.isOffline) {
      this.mouseMovement.x = 0;
      this.mouseMovement.y = 0;
    }
  }

  /**
   * Takes in data passed from the client to the server as input.
   */
  setInputFromData(data) {
    this.mouseMovement = data.mouseMovement;
    this.cameraRotation = data.cameraRotation;
    this.actions = data.actions ? data.actions : {};
    this.inputDevice = data.inputDevice;
  }

  /**
   * Called every step of the physics engine to keep the mesh and physics object
   * synchronized.
   */
  update() {
    if (!this.mesh || !this.physicsBody) {
      return;
    }
    this.mesh.position.x = this.physicsBody.interpolatedPosition[0];
    this.mesh.position.z = this.physicsBody.interpolatedPosition[1];
    this.mesh.rotation.y = -this.physicsBody.interpolatedAngle;
  }

  /** 
   * Updates the entity based on data sent from the server.
   */
  consumeUpdate(physics) {
    if (!physics)
      return;
    const [angVelo, pos, velo, rot] = physics;
    this.physicsBody.angularVelocity = angVelo;
    this.physicsBody.angle = rot;
    p2.vec2.copy(this.physicsBody.position, pos);
    p2.vec2.copy(this.physicsBody.velocity, velo);
  }

  /**
   * Registers the entity to the physics engine.
   */
  registerToPhysics() {
    Physics.get().registerEntity(this);
  }

  /**
   * Registers a component of an entity to the physics engine. This
   * is primarily used if there is a body separate from the entity's
   * main physics body.
   */
  registerComponent(body) {
    let physics;
    if (this.parentGame && this.parentGame.physics) {
      physics = this.parentGame.physics;
    } else {
      physics = Physics.get();
    }
    physics.registerComponent(body);
  }

  /**
   * Loads entity settings.
   */
  loadSettings() {
    this.enableMouseY = Settings$1.get('mouse_y');
    this.mouseSensitivity = Settings$1.get('mouse_sensitivity');
  }
}

let instance$4 = null;

/**
 * Light core for the game engine. Creates and manages light
 * sources in-game. Should be used as a singleton.
 */
class Light extends Plugin {
  /**
   * Enforces singleton light instance.
   */
  static get() {
    if (!instance$4) {
      instance$4 = new Light();
    }
    return instance$4;
  }

  constructor() {
    super();
    this.ambientLight = null;
    this.directionalLights = [];
    SettingsEvent.listen(this.handleSettingsChange.bind(this));
  }
  
  /** @override */
  reset() {
    instance$4 = null;
    // TODO: Disponse of lighting objects correctly.
  }

  /** @override */
  update() {}

  /**
   * Creates the ambient lighting. Use this for easing/darkening shadows.
   */
  createAmbientLight(ambientConfig) {
    const ambientLight =
          new THREE.AmbientLight(parseInt(ambientConfig.color, 16));
    ambientLight.intensity = ambientConfig.intensity;
    Engine.get().getScene().add(ambientLight);
    return ambientLight;
  }

  /**
   * Creates the entire set of directional lights.
   */
  createDirectionalLights(directionalConfig) {
    const directionalLights = [];
    if (!directionalConfig || !directionalConfig.length) {
      return directionalLights;
    }
    for (let i = 0; i < directionalConfig.length; i++) {
      const light = directionalConfig[i];
      const x = light.x;
      const y = light.y;
      const z = light.z;
      const color = parseInt(light.color, 16);
      const intensity = light.intensity;
      directionalLights.push(
        this.createDirectionalLight(x, y, z, color, intensity));
    }
    return directionalLights;
  }

  /**
   * Creates the directional lighting. Use this for generating shadows.
   */
  createDirectionalLight(x, y, z, color, intensity) {
    const directionalLight = new THREE.DirectionalLight(color);
    directionalLight.position.set(x, y, z);
    directionalLight.intensity = intensity;
    if (Settings$1.get('shaders')) {
      this.shadersEnabled = true;
      this.createShaders(directionalLight);
    }
    Engine.get().getScene().add(directionalLight);
    return directionalLight;
  }
  
  /**
   * Creates the entire set of directional lights.
   */
  createSpotLights(spotConfig) {
    const spotLights = new Array();
    if (!spotConfig || !spotConfig.length) {
      return spotLights;
    }
    for (let i = 0; i < spotConfig.length; i++) {
      const light = spotConfig[i];
      const x = light.x;
      const y = light.y;
      const z = light.z;
      const color = parseInt(light.color, 16);
      const intensity = light.intensity;
      const angle = light.angle;
      const penumbra = light.penumbra;
      const shaders = light.shaders;
      spotLights.push(this.createSpotLight(
        x, y, z, color, intensity, angle, penumbra, shaders));
    }
    return spotLights;
  }
  
  /**
   * Creates a spot light. Use this for generating shadows.
   */
  createSpotLight(x, y, z, color, intensity, angle, penumbra, shaders) {
    const spotLight = new THREE.SpotLight(color);
    spotLight.position.set(x, y, z);
    spotLight.intensity = intensity;
    spotLight.angle = angle;
    spotLight.penumbra = penumbra;
    if (Settings$1.get('shaders') && shaders) {
      this.shadersEnabled = true;
      this.createShaders(spotLight);
    }
    Engine.get().getScene().add(spotLight);
    return spotLight;
  }

  /**
   * Creates the shaders for a directional light.
   */
  createShaders(light) {
    const cameraRange = 120;
    light.castShadow = true;
    light.shadow.camera.bottom = -cameraRange;
    light.shadow.camera.left = -cameraRange;
    light.shadow.camera.right = cameraRange;
    light.shadow.camera.top = cameraRange;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 500;
    light.shadow.bias = .0001;
    light.shadow.radius = 4;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
  }
  
  /**
   * Handles the settings change event.
   */
  handleSettingsChange() {
    if (!!Settings$1.get('shaders') == !!this.shadersEnabled) {
      return;
    }
    if (Settings$1.get('shaders')) {
      this.enableShaders();
    } else {
      this.disableShaders();
    }
  }
  
  /**
   * Enables shaders.
   */
  enableShaders() {
    this.shadersEnabled = true;
    this.directionalLights.forEach((light) => {
      this.createShaders(light);
    });
    this.spotLights.forEach((light) => {
      this.createShaders(light);
    });
  }
  
  /**
   * Disables shaders.
   */
  disableShaders() {
    this.shadersEnabled = false;
    this.directionalLights.forEach((light) => {
      light.castShadow = false;
    });
    this.spotLights.forEach((light) => {
      light.castShadow = false;
    });
  }

}

/**
 * Custom event fired when a soft error occurs.
 */
class ErrorEvent extends EraEvent {
  constructor(message) {
    const label = 'error';
    const data = {
      message
    };
    super(label, data);
  }
  
  /** @override */
  static listen(callback) {
    EraEvent.listen('error', callback);
  }
}

const GAMEHOST_KEY = 'gamehost';
const GAMEPORT_KEY = 'gameport';

/**
 * Core functionality for network procedures in the game. Can be extended
 * in the case of different servers.
 */

let networkInstance = null;

class Network {

  /**
   * Enforces singleton instance, if no other subclasses.
   */
  static get() {
    if (!networkInstance) {
      let host = localStorage.getItem(GAMEHOST_KEY);
      let port = localStorage.getItem(GAMEPORT_KEY);
      if (!host) {
        port = 5000;
        if(isBeta()) {
          host = 'ec2-18-197-111-163.eu-central-1.compute.amazonaws.com';
        } else {
          host = 'ec2-54-172-65-111.compute-1.amazonaws.com';
        }
      }
      networkInstance = new Network(host, port);
      //if (window.devMode) {
      //  networkInstance = new Network('localhost', 5000);
      //}
    }
    return networkInstance;
  }

  /**
   * Clears the registered singleton instance.
   */
  static clear() {
    if (!networkInstance) {
      return;
    }
    networkInstance.disconnect();
    networkInstance = null;
  }

  constructor(host, port) {
    this.host = host;
    this.port = port;
    this.path = this.createPath(host, port);
    this.cleared = false;
    this.shouldReload = true;
    this.pendingResponses = new Set();
  }

  /**
   * Disconnects the network instance.
   */
  disconnect() {
    this.cleared = true;
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  /**
   * Creates a path given the host and port
   */
  createPath(host, port) {
    return `${host}:${port}`;
  }

  setAuthToken(token) {
    this.token = token;
  }

  /**
   * Creates and sends an HTTP POST request.
   */
  createPostRequest(path, data) {
    path = 'http://' + this.path + path;
    return new Promise((resolve, reject) => {
      let req = new XMLHttpRequest();
      req.open('POST', path, true);
      req.setRequestHeader('Content-type', 'application/json');
      if (this.token)
        req.setRequestHeader('Authorization', this.token);
      req.addEventListener('load', () => {
        if (req.status == 200 || req.status == 304) {
          let response = JSON.parse(req.responseText);
          resolve(response);
        } else {
          reject(this.createError(req));
        }
      });
      req.addEventListener('error', () => {
        reject(this.createError(req));
      });
      req.send(JSON.stringify(data));
    });
  }

  /** 
   * Creates and sends an HTTP GET request.
   */
  createGetRequest(path) {
    path = 'http://' + this.path + path;
    return new Promise((resolve, reject) => {
      let req = new XMLHttpRequest();
      req.open('GET', path, true);
      req.setRequestHeader('Content-type', 'application/json');
      if (this.token)
        req.setRequestHeader('Authorization', this.token);
      req.addEventListener('load', () => {
        if (req.status == 200) {
          let response = JSON.parse(req.responseText);
          resolve(response);
        } else {
          reject(this.createError(req));
        }
      });
      req.addEventListener('error', () => {
        reject(this.createError(req));
      });
      req.send();
    });
  }

  /**
   * Creates and sends an HTTP DELETE request.
   */
  createDeleteRequest(path, data) {
    path = 'http://' + this.path + path;
    return new Promise((resolve, reject) => {
      let req = new XMLHttpRequest();
      req.open('DELETE', path, true);
      req.setRequestHeader('Content-type', 'application/json');
      if (this.token)
        req.setRequestHeader('Authorization', this.token);
      req.addEventListener('load', () => {
        if (req.status == 200) {
          let response = JSON.parse(req.responseText);
          resolve(response);
        } else {
          reject(this.createError(req));
        }
      });
      req.addEventListener('error', () => {
        reject(this.createError(req));
      });
      req.send(JSON.stringify(data));
    });
  }

  /**
   * Creates an ERA error for a failed or invalid HTTP request.
   */
  createError(req) {
    let message;
    try {
      message = JSON.parse(req.responseText).message;
    } catch (e) {
      message = req.responseText;
    }
    return new Error(message);
  }

  /**
   * Begins to establish a WebSockets connection to the server. The query
   * parameter is a map of query params used in the connection string.
   * Returns a promise with the resolver set in a field. Once the connection
   * is successful, it resolves.
   */
  async createSocketConnection(query, required = false) {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        return resolve(this.socket);
      }
      this.connectionResolver = resolve;
      const params = {
        reconnection: false
      };
      if (!query) {
        query = new Map();
      }
      query.set('token', this.token);
      if (window.devMode) {
        query.set('dev', '1');
      }
      let queryString = '';
      for (let pair of query) {
        let pairString = pair[0] + '=' + pair[1];
        if (queryString) {
          pairString = '&' + pairString;
        }
        queryString += pairString;
      }
      if (queryString) {
        params.query = queryString;
      }
      const path = 'ws://' + this.createPath(this.host, this.port);
      this.socket = io.connect(path, params);
      this.socket.on('connect', () => this.handleConnect(required));
    });
  }

  /**
   * Handles a successful connection to the WebSockets server.
   */
  handleConnect(required) {
    this.connectionResolver(this.socket);
    this.socket.on('error', (err) => {
      const message = 'Socket error:' + JSON.stringify(err);
      console.error(message);
      new ErrorEvent(message).fire();
    });
    if (required) {
      this.socket.once('disconnect', (reason) => {
        console.error('Disconnecting from socket', reason);
        new ErrorEvent(reason).fire();
        if (!this.cleared) {
          window.location.reload();
        }
      });
    }
  }

  /**
   * Sends a WS message and waits for a specific reply indicating that the
   * message was received. The key is the socket endpoint, so only one call
   * to a certain endpoint can be awaited at once.
   * @param {string} endpoint The emitted endpoint name.
   * @param {*} sentData The data to emit, if any.
   * @param {string=} responseEndpoint Optional response endpoint name.
   */
  async emitAndAwaitResponse(endpoint, sentData, responseEndpoint) {
    if (!this.socket) {
      throw new Error('No socket installed.');
    }
    // Default the response endpoint to the emitted endpoint.
    if (!responseEndpoint) {
      responseEndpoint = endpoint;
    }
    // Don't install a listener for something twice.
    if (this.pendingResponses.has(endpoint) ||
        this.pendingResponses.has(responseEndpoint)) {
      throw new Error('Listener already installed.');
    }
    this.pendingResponses.add(endpoint);
    this.pendingResponses.add(responseEndpoint);
    this.socket.removeAllListeners(endpoint);
    this.socket.removeAllListeners(responseEndpoint);

    return new Promise((resolve, reject) => {
      this.socket.once(responseEndpoint, (data) => {
        resolve(data);
      });
      this.socket.emit(endpoint, sentData);
    });
  }

  /**
   * Waits for a message to be received, then resolves.
   * @param {string} endpoint
   */
  async waitForMessage(endpoint) {
    if (!this.socket) {
      throw new Error('No socket installed.');
    }
    if (this.pendingResponses.has(endpoint)) {
      throw new Error('Listener already installed.');
    }
    this.pendingResponses.add(endpoint);
    this.socket.removeAllListeners(endpoint);
    return new Promise((resolve, reject) => {
      this.socket.once(endpoint, (data) => {
        return resolve(data);
      });
    });
  }
}

export { Audio, Controls, Engine, EngineResetEvent, Entity, EraEvent, Events, Light, Models, Network, Physics, Plugin, Settings$1 as Settings, SettingsEvent };
