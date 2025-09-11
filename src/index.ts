import {
  Game,
  InteractionEnum_ENUM,
  MapObject,
  WireObject,
  PlayerMoves,
  Player,
} from "@gathertown/gather-game-client";
import { nanoid } from "nanoid";
import { Pathfinder } from "./pathfinder";
// replace the global WebSocket with the isomorphic-ws
global.WebSocket = require("isomorphic-ws");

// replace with your spaceId, that you can edit
const SPACE_ID = "k1s3wHMOVDoLHVCo\\fstest";

const game = new Game(SPACE_ID, () =>
  Promise.resolve({ apiKey: process.env.GATHER_API_KEY ?? "" })
);
game.connect();
game.subscribeToConnection((connected) => console.log("connected?", connected));

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

game.waitForInit().then(() => {
  const pets = new Set<string>();
  // const petsObjectKes = new Map<string, string>();
  const me = game.getMyPlayer();
  // isPet :: MapObject -> Bool
  const isPet = (obj: MapObject | WireObject) =>
    obj.objectPlacerId === me.id && obj._tags?.includes("pet-mon");
  const clearPets = () => {
    deleteObjects(isPet);
    pets.clear();
  };

  const finder = new Pathfinder();
  // load the collision map into the pathfinder
  const loadMaps = (mapId: string) => {
    console.log("loading collision map for", mapId);

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

  const handleMove = debounce((playerMoves: PlayerMoves) => {
    console.log("player", playerMoves);

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
      const paths = finder.findPath({
        x: pet?.obj.x ?? 0,
        y: pet?.obj.y ?? 0,
      }, {
        x: playerMoves.x ?? 0,
        y: playerMoves.y ?? 0,
      });
      console.log("paths", paths?.map(p => {
        return { x: p.a.x, y: p.a.y, direction: p.direction, distance: Math.sqrt(Math.pow(p.a.x - p.b.x, 2) + Math.pow(p.a.y - p.b.y, 2)) }
      }));

      game.moveMapObject(
        me.map,
        objId,
        {
          x: playerMoves.x ?? 0,
          y: playerMoves.y ?? 0,
          xOffset: 0,
          yOffset: 0,
        },
        1000,
        "Linear"
      );
    });
  }, 500);

  // claim pets by storing them in a set
  game.subscribeToEvent(
    "mapSetObjectsV2",
    ({ mapSetObjectsV2 }) => {
      Object.entries(mapSetObjectsV2.objects)
        .filter(([_, obj]) => isPet(obj))
        .filter(([_, obj]) => obj.id)
        .forEach(([_, obj]) => {
          console.log("found a pet!", obj.id);

          pets.add(obj.id!);
          // petsObjectKes.set(obj.id!, key);
        });
    },
    ({ mapSetObjectsV2 }) => {
      return Object.values(mapSetObjectsV2.objects).some(isPet);
    }
  );

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
      console.log(
        game?.partialMaps[playerInteractsWithObject.mapId]?.objects?.[
          playerInteractsWithObject.key
        ]
      );
    }
  );

  // load the collision map into the pathfinder
  loadMaps(me.map);
  // clean up the old ones
  clearPets();
  // spawn a new pet every time
  createPet(me);
});

const createPet = (me: Player) => {
  game.addObject(me.map, {
    _tags: ["pet-mon"],
    _name: "Pet",
    id: "PET_" + nanoid(),
    type: InteractionEnum_ENUM.EXTENSION,
    x: me.x,
    y: me.y,
    width: 1,
    height: 1,
    normal:
      "https://cdn.gather.town/v0/b/gather-town.appspot.com/o/manually-uploaded%2Ftree-green.png?alt=media&token=b92b7d03-1f03-40f9-88f5-8dc683b6590e",
    previewMessage: "Press x to pet",
    distThreshold: 1,
    properties: {
      petType: "custom",
    },
  });
};

const deleteObjects = (
  isPet: (obj: MapObject | WireObject) => boolean | undefined
) => {
  game.getKnownCompletedMaps().forEach((map) => {
    Object.entries(game.partialMaps[map].objects ?? {})
      .filter(([_, obj]) => isPet(obj))
      .forEach(([key, obj]) => {
        console.log("cleaning up old object", key);
        game.deleteObjectByKey(map, key);
      });
  });
};
