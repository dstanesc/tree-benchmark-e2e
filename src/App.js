import React, { useEffect, useState, useRef } from "react";
import _ from "lodash";
import "./App.css";
import { initMap } from "@dstanesc/shared-tree-map";
import { partReport } from "@dstanesc/fake-metrology-data";
import { layout, trace, boxPlot, histogram, violinPlot } from "./plot";

function App() {
  const [button, setButton] = useState("Start e2e");

  const [valueSize, setValueSize] = useState(0);

  const [valueSizeBytes, setValueSizeBytes] = useState([]);

  // local view
  const [sharedPropertyMap, setSharedPropertyMap] = useState();

  // remote view
  const [remotePropertyMap, setRemotePropertyMap] = useState();

  const [localModel, setLocalModel] = useState(new Set());

  // timing
  const [startTimes, setStartTimes] = useState(new Map());

  const [endTimes, setEndTimes] = useState(new Map());

  const [durations, setDurations] = useState(new Map());

  const mapId = window.location.hash.substring(1) || undefined;

  async function init() {
    const sharedMap = await initMap(mapId);
    if (mapId === undefined) {
      window.location.hash = sharedMap.mapId();
    }
    setSharedPropertyMap(sharedMap);
    return sharedMap.mapId();
  }

  const findIncrement = async (map, localModelSetter, callback) => {
    await localModelSetter((oldKeys) => {
      const newKeys = new Set(oldKeys);
      const increments = [];
      for (const key of map.keys()) {
        if (!oldKeys.has(key)) {
          increments.push({ key, value: map.get(key) });
          newKeys.add(key);
        }
      }
      callback(increments);
      return newKeys;
    });
  };

  const updateStats = (key) => {
    const d = new Date();
    const localTime = d.getTime();
    const newEndTimes = new Map(endTimes);
    endTimes.set(key, localTime);
    setEndTimes(newEndTimes);
  };

  useEffect(() => {
    init().then((localId) => {
      initMap(localId).then((remoteMap) => {
        setRemotePropertyMap(remoteMap);
        remoteMap.getBinder().bindOnBatch(() => {
          findIncrement(remoteMap.asMap(), setLocalModel, (increments) => {
            increments
              .map((incr) => incr.key)
              .forEach((key) => {
                updateStats(key);
              });
          });
        });
      });
    });
  }, []);

  useEffect(() => {
    const keys = Array.from(durations.keys());
    const values = Array.from(durations.values());
    const scatterTrace = trace({ keys, values });
    const boxPlotTrace = boxPlot({ values });
    const histogramTrace = histogram({ values });
    const violinPlotTrace = violinPlot({ values });
    const data = [scatterTrace];
    Plotly.newPlot("plotDiv", data, layout());
    Plotly.newPlot("boxDiv", [boxPlotTrace], {});
    Plotly.newPlot("histDiv", [histogramTrace], {});
    Plotly.newPlot("violinDiv", [violinPlotTrace], {});
    if (durations.size === 0) {
      setButton("Start e2e");
    } else if (durations.size > 95) {
      setButton("Re-Start");
    } else {
      setButton("Running");
    }
  }, [durations]);

  useEffect(() => {
    const times = new Map();
    endTimes.forEach((endTime, key) => {
      const startTime = startTimes.get(key);
      const duration = endTime - startTime;
      times.set(key, duration);
    });
    setDurations(times);
  }, [endTimes]);

  const roll = async () => {
    if (remotePropertyMap) {
      const loops = _.range(100);
      for (const loop of loops) {
        await execFn(rollDice, `${loop}`);
      }
    } else {
      alert("Please wait to initialize");
    }
  };

  const cleanUp = async () => {
    for (const key of startTimes.keys()) {
      await execFn(() => {
        if (sharedPropertyMap.has(key)) {
          sharedPropertyMap.delete(key);
        }
      });
    }
  };

  const execFn = (fn, arg1) => {
    fn(arg1);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });
  };

  const rollDice = (key) => {
    const newValue = generateValue(valueSize);
    const newBytes = computeByteLength(newValue);
    setValueSizeBytes((oldBytes) => [...oldBytes, newBytes]);
    const d = new Date();
    const localTime = d.getTime();
    const newStartTimes = startTimes.set(key, localTime);
    setStartTimes(new Map(newStartTimes));
    sharedPropertyMap.set(key, newValue);
  };

  const messageLatency = () => {
    const values = Array.from(durations.values()).map(Number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return Number.isFinite(min) ? `min: ${min} ms, max: ${max} ms` : ``;
  };

  const messageByteSize = () => {
    const minBytes = Math.min(...valueSizeBytes);
    const maxBytes = Math.max(...valueSizeBytes);
    return Number.isFinite(minBytes)
      ? `min: ${minBytes} bytes, max: ${maxBytes} bytes`
      : ``;
  };

  const generateValue = (size) => {
    let value;
    switch (size) {
      case 0:
        value = Math.floor(Math.random() * 1024) + 1;
        break;
      default:
        value = partReport({ reportSize: size });
        break;
    }
    return JSON.stringify(value);
  };

  const onChangeSize = (event) => {
    setValueSize(event.target.value);
  };

  const computeByteLength = (s) => {
    return new TextEncoder().encode(s).length;
  };

  const refresh = () => {
    window.location.reload(false);
  };

  return (
    <div className="App">
      <div className="radios" onChange={onChangeSize}>
        <label>Size class: </label>
        <input type="radio" value="0" name="sizeX" defaultChecked /> 0
        <input type="radio" value="1" name="sizeX" /> 1
        <input type="radio" value="5" name="sizeX" /> 5
        <input type="radio" value="10" name="sizeX" /> 10
      </div>
      <div
        className="remote"
        onClick={() => {
          if (durations.size === 0) {
            roll();
          } else {
            refresh();
          }
        }}
      >
        [{button}]
      </div>
      <div className="message">
        Latency {messageLatency()}, Payload {messageByteSize()}{" "}
      </div>
      <div id="plotDiv"></div>
      <div id="boxDiv"></div>
      <div id="histDiv"></div>
      <div id="violinDiv"></div>
    </div>
  );
}

function replacer(key, value) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return value instanceof Map
    ? {
        mapped: [...value.entries()],
      }
    : value;
}

export default App;
