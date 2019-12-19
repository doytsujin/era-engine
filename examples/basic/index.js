/**
 * @author rogerscg / https://github.com/rogerscg
 */

import XWing from './xwing.js';
import {
  Audio,
  Controls,
  Engine,
  Environment,
  Models,
  RendererStats,
  Settings,
} from '/src/era.js';
import settings from '../../src/core/settings.js';

async function start() {
  // Load models.
  await Models.get().loadAllFromFile('/examples/basic/models/models.json');

  // Load sounds.
  await Audio.get().loadAllFromFile('/examples/basic/sounds/sounds.json');

  // Create engine and load models.
  const engine = Engine.get();
  engine.start();
  const scene = engine.getScene();

  // Enable debug.
  new RendererStats(engine.getRenderer());

  // Create environment.
  const environment = 
    await new Environment()
            .loadFromFile('/examples/basic/environments/space.json');
  scene.add(environment);

  // Create X-Wing.
  const xwing = new XWing().build();
  scene.add(xwing);

  // Attach camera to XWing.
  engine.attachCamera(xwing);
  Controls.get().registerEntity(xwing);
}

document.addEventListener('DOMContentLoaded', start);
