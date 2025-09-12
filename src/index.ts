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

const offsetX = spritesheet.framing?.frameWidth ? (-Math.ceil(spritesheet.framing?.frameWidth / 4) + 1) : undefined;
const offsetY = spritesheet.framing?.frameHeight ? (-spritesheet.framing?.frameHeight / 2) : undefined;

game.waitForInit().then(() => {
  const pets = new Set<string>();
  const petsObjectKes = new Map<string, string>();
  const me = game.getMyPlayer();
  // isPet :: MapObject -> Bool
  const isPet = (obj: MapObject | WireObject) =>
    obj.objectPlacerId === me.id && obj.extensionClass === "PetMon";
  const clearPets = () => {
    deleteObjects(isPet);
    pets.clear();
  };

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
          extensionClass: "PetMon",
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
          extensionClass: "PetMon",
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

  const handleMove = debounce((playerMoves: PlayerMoves) => {
    if (playerMoves.mapId) {
      console.log("player moved to a new map");

      // load the collision map into the pathfinder
      loadMaps(playerMoves.mapId);
      // clean up the old ones
      clearPets();
      // spawn a new pet every time
      createPet(me);
    }

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

  game.subscribeToEvent("mapSetObjectsV2", ({ mapSetObjectsV2 }) => {
    Object.values(mapSetObjectsV2.objects)
      .filter((obj) => !isPet(obj))
      .forEach((obj) => {
        console.log("found a pet!", JSON.stringify(obj));
      });
  });

  // Move pets around if the player moves
  game.subscribeToEvent(
    "playerMoves",
    ({ playerMoves }) => {
      handleMove(playerMoves);
    },
    ({ playerMoves }) => {
      return game.getPlayerUidFromEncId(playerMoves.encId) === me.id;
    }
  );

  game.subscribeToEvent(
    "playerInteractsWithObject",
    ({ playerInteractsWithObject }) => {
      console.log("player interacted with", playerInteractsWithObject);
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
  // spawn a new pet every time
  createPet(me);
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

const createPet = (me: Player) => {
  game.addObject(me.map, {
    _tags: ["pet-mon"],
    // _name: "PetMon",
    extensionClass: "PetMon",
    id: "PETMON_" + nanoid(),
    type: InteractionEnum_ENUM.EXTENSION,
    x: me.x,
    y: me.y,
    offsetX: offsetX,
    offsetY: offsetY,
    width: spritesheet.framing?.frameWidth ?? 1,
    height: spritesheet.framing?.frameHeight ?? 1,
    normal:
      "https://cdn.gather.town/storage.googleapis.com/gather-town.appspot.com/uploads/k1s3wHMOVDoLHVCo/GESdJsGvpTDMLYFfDsfxz7",
    // previewMessage: "Press x to pet",
    // distThreshold: 1,
    spritesheet: spritesheet,
    properties: {
      // petType: "custom",
    },
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
