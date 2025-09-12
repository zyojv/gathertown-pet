import {
  Game,
  InteractionEnum_ENUM,
  MapObject,
  WireObject,
  PlayerMoves,
  Player,
  WireObjectSpritesheet,
} from "@gathertown/gather-game-client";
import { nanoid } from "nanoid";
import { Pathfinder, Direction } from "./pathfinder";
import { PetAI } from "./follower";
import spritesheetBase from "../assets/spritesheet.json";
// replace the global WebSocket with the isomorphic-ws
global.WebSocket = require("isomorphic-ws");

// replace with your spaceId, that you can edit
const SPACE_ID = "k1s3wHMOVDoLHVCo\\fstest";
const TRAVELING_TIME = 300; // 1 block per 500 ms
const DISTANCE_THRESHOLD = 2; // blocks away from the player

const EXTENSION_CLASS = "Monster";
const EXTENSION_CLASS_CAGE = "Monster_Cage";

const game = new Game(SPACE_ID, () =>
  Promise.resolve({ apiKey: process.env.GATHER_API_KEY ?? "" })
);
game.connect();
game.subscribeToConnection((connected) => console.log("connected?", connected));

// TODO: Let the moving queue finish before recalculating the path
// TODO: Fix I am somewho overtaking the original pets

const anims = new Map<Direction, string>([
  ["north", "walk-n"],
  ["south", "walk-s"],
  ["east", "walk-e"],
  ["west", "walk-w"],
  ["northeast", "walk-ne"],
  ["northwest", "walk-nw"],
  ["southeast", "walk-se"],
  ["southwest", "walk-sw"],
]);

// @ts-ignore
const spritesheet: WireObjectSpritesheet = {
  ...spritesheetBase,
  spritesheetUrl:
    "https://cdn.gather.town/storage.googleapis.com/gather-town.appspot.com/uploads/k1s3wHMOVDoLHVCo/imMfMu9eOgurXeMu40ucBN",
  currentAnim: "idle-s",
};

const offsetX = spritesheet.framing?.frameWidth
  ? -Math.floor(spritesheet.framing?.frameWidth / 4) + 1
  : undefined;
const offsetY = spritesheet.framing?.frameHeight
  ? -spritesheet.framing?.frameHeight / 2
  : undefined;
const width = spritesheet.framing?.frameWidth
  ? Math.ceil(spritesheet.framing?.frameWidth / 32)
  : 1;
const height = spritesheet.framing?.frameHeight
  ? Math.ceil(spritesheet.framing?.frameHeight / 32)
  : 1;

game.waitForInit().then(() => {
  const pets = new Set<string>();
  const petsObjectKes = new Map<string, string>();
  const me = game.getMyPlayer();
  // isPet :: MapObject -> Bool
  const isPet = (obj: MapObject | WireObject) =>
    obj.objectPlacerId === me.id && obj.extensionClass === EXTENSION_CLASS;

  const finder = new Pathfinder();
  // load the collision map into the pathfinder
  const loadMaps = (mapId: string) => {
    // console.log("loading collision map for", mapId);

    finder.clearBlocked();
    Object.entries(game.partialMaps[mapId].collisions ?? {}).forEach(
      ([y, xAxis]) => {
        Object.entries(xAxis)
          .filter(([_, tile]) => tile)
          .forEach(([x, tile]) => {
            finder.addBlocked({ x: Number(x), y: Number(y) });
          });
      }
    );
  };

  const ai = new PetAI(TRAVELING_TIME);
  let lastAnim: string | null = null;
  ai.subscribeToMovement((segment, travelingTime) => {
    console.log("AI moving", segment);

    pets.forEach((objId) => {
      const key = petsObjectKes.get(objId)!;
      const nextAnim = anims.get(segment.direction);
      console.log("anim", nextAnim);
      if (lastAnim !== nextAnim && nextAnim !== undefined) {
        // Set the animation of the pet
        game.updateObject(me.map, key, {
          id: objId,
          extensionClass: EXTENSION_CLASS,
          spritesheet: {
            ...spritesheet,
            currentAnim: nextAnim,
          },
          properties: {},
        });
        lastAnim = nextAnim;
      }

      game.moveMapObject(
        me.map,
        objId,
        {
          x: segment.b.x ?? 0,
          y: segment.b.y ?? 0,
          xOffset: offsetX,
          yOffset: offsetY,
        },
        travelingTime,
        "Linear"
      );
    });
  });
  ai.subscribeToMovementDone(() => {
    console.log("AI done");

    pets.forEach((objId) => {
      const pet = game.getObject(objId, me.map);
      if (!pet) {
        return;
      }
      // Calculate the distance to the player
      const distance = Math.sqrt(
        Math.pow(pet.obj.x - me.x, 2) + Math.pow(pet.obj.y - me.y, 2)
      );
      console.log("pet", pet.key, "is", distance, "blocks away from me");

      if (distance > DISTANCE_THRESHOLD) {
        const paths = finder.findPath(
          {
            x: pet?.obj.x ?? 0,
            y: pet?.obj.y ?? 0,
          },
          {
            x: me.x ?? 0,
            y: me.y ?? 0,
          }
        );
        // TODO: This will not work with multiple pets
        ai.queueMovement(paths ?? []);
      } else {
        // put the pet back into idle
        const key = petsObjectKes.get(objId)!;
        game.updateObject(me.map, key, {
          id: objId,
          extensionClass: EXTENSION_CLASS,
          spritesheet: {
            ...spritesheet,
            currentAnim: "idle-s",
          },
          properties: {},
        });
        lastAnim = "idle-s";
      }
    });
  });

  const clearPets = () => {
    deleteObjects(isPet);
    pets.clear();
    petsObjectKes.clear();
    ai.clear();
    lastAnim = null;
  };

  const handleMove = debounce((playerMoves: PlayerMoves) => {
    pets.forEach((objId) => {
      const pet = game.getObject(objId, me.map);
      const paths = finder.findPath(
        {
          x: pet?.obj.x ?? 0,
          y: pet?.obj.y ?? 0,
        },
        {
          x: playerMoves.x ?? 0,
          y: playerMoves.y ?? 0,
        }
      );
      // TODO: This will not work with multiple pets
      ai.queueMovement(paths ?? []);
    });
  }, 250);

  // Move pets around if the player moves
  game.subscribeToEvent(
    "playerMoves",
    ({ playerMoves }) => {
      if (pets.size === 0) {
        return;
      }

      if (playerMoves.mapId) {
        console.log("player moved to a new map");

        // load the collision map into the pathfinder
        loadMaps(playerMoves.mapId);
        // clean up the old ones
        clearPets();
        // spawn a new pet every time
        createPet(playerMoves.mapId, playerMoves.x ?? 0, playerMoves.y ?? 0);
      }

      handleMove(playerMoves);
    },
    ({ playerMoves }) => {
      return game.getPlayerUidFromEncId(playerMoves.encId) === me.id;
    }
  );

  // claim pets by storing them in a set
  game.subscribeToEvent(
    "mapSetObjectsV2",
    ({ mapSetObjectsV2 }) => {
      Object.entries(mapSetObjectsV2.objects)
        .filter(([_, obj]) => isPet(obj))
        .filter(([_, obj]) => obj.id)
        .forEach(([key, obj]) => {
          console.log("found a pet!", obj.id);

          pets.add(obj.id!);
          petsObjectKes.set(obj.id!, key);
        });
    },
    ({ mapSetObjectsV2 }) => {
      return Object.values(mapSetObjectsV2.objects).some(isPet);
    }
  );

  game.subscribeToEvent(
    "playerInteractsWithObject",
    ({ playerInteractsWithObject }) => {
      console.log("player interacted with", playerInteractsWithObject);

      const obj =
        game.partialMaps[playerInteractsWithObject.mapId]?.objects?.[
          playerInteractsWithObject.key
        ];
      if (!obj) {
        console.log("player interacted with unknown object");
        return;
      }

      const x = obj.x ?? 0;
      const y = obj.y ?? 0;
      if (obj.extensionClass === EXTENSION_CLASS_CAGE) {
        console.log("player interacted with cage");
        clearPets();
        game.deleteObjectByKey(
          playerInteractsWithObject.mapId,
          playerInteractsWithObject.key
        );
        createPet(playerInteractsWithObject.mapId, x, y);
        return;
      }

      console.log("player interacted with pet");
      if (!ai.isIdle) {
        console.log("AI is busy, ignoring");
        return;
      }

      // clean up the pet in preparation to put it into a ball
      clearPets();
      createCage(playerInteractsWithObject.mapId, x, y);
    },
    ({ playerInteractsWithObject }) => {
      const obj =
        game.partialMaps[playerInteractsWithObject.mapId]?.objects?.[
          playerInteractsWithObject.key
        ];
      if (obj?.objectPlacerId !== me.id) {
        return false;
      }
      return (
        obj.extensionClass === EXTENSION_CLASS ||
        obj.extensionClass === EXTENSION_CLASS_CAGE
      );
    }
  );

  // // TODO: Add back to find out the image url of the pet
  // if (true) {
  //   Object.values(game.partialMaps[me.map].objects ?? {})
  //     .filter((obj) => obj.objectPlacerId === me.id)
  //     .forEach((obj) => {
  //       console.log("found a pet!", obj);
  //     });
  // }

  // load the collision map into the pathfinder
  loadMaps(me.map);
  // clean up the old ones
  clearPets();

  // check if there is a cage in the map
  if (
    game.filterObjectsInSpace(
      (obj) =>
        obj.extensionClass === EXTENSION_CLASS_CAGE &&
        obj.objectPlacerId === me.id
    ).length === 0
  ) {
    // spawn a new pet every time
    createPet(me.map, me.x, me.y);
  } else {
    console.log("found a cage, not spawning a pet");
  }
});

const debounce = <T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number
) => {
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastArgs: T | null = null;
  let hasNewValue = false;

  const start = () => {
    if (!timer) {
      timer = setInterval(() => {
        if (hasNewValue && lastArgs !== null) {
          fn(...lastArgs);
          hasNewValue = false; // reset after emitting
        } else {
          // No new data → stop ticker automatically
          clearInterval(timer!);
          timer = null;
        }
      }, delay);
    }
  };

  return (...args: T) => {
    lastArgs = args;
    hasNewValue = true;
    start(); // start ticker if not running
  };
};

const createPet = (mapId: string, x: number, y: number) => {
  game.addObject(mapId, {
    _tags: ["monster"],
    id: "MON_" + nanoid(),
    type: InteractionEnum_ENUM.EXTENSION,
    extensionClass: EXTENSION_CLASS,
    normal:
      "https://cdn.gather.town/storage.googleapis.com/gather-town.appspot.com/uploads/k1s3wHMOVDoLHVCo/GESdJsGvpTDMLYFfDsfxz7",
    previewMessage: "Press x to return",
    distThreshold: 1,
    spritesheet: spritesheet,
    offsetX,
    offsetY,
    width,
    height,
    x,
    y,
  });
};

const createCage = (mapId: string, x: number, y: number) => {
  game.addObject(mapId, {
    _tags: ["monster"],
    type: InteractionEnum_ENUM.EXTENSION,
    id: "MON_CAGE_" + nanoid(),
    extensionClass: EXTENSION_CLASS_CAGE,
    normal:
      "https://cdn.gather.town/storage.googleapis.com/gather-town.appspot.com/uploads/k1s3wHMOVDoLHVCo/mzD8uymlhRtEC1dJjRW10E",
    previewMessage: "Press x to release",
    distThreshold: 1,
    width: 1,
    height: 1,
    x,
    y,
  });
};

const deleteObjects = (
  filter: (obj: MapObject | WireObject) => boolean | undefined
) => {
  game.getKnownCompletedMaps().forEach((map) => {
    Object.entries(game.partialMaps[map].objects ?? {})
      .filter(([_, obj]) => filter(obj))
      .forEach(([key]) => {
        console.log("cleaning up old object", key);
        game.deleteObjectByKey(map, key);
      });
  });
};
