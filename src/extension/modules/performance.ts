import {
  dumpPerfHistograms,
  resetPerfHistograms,
  startPerfObserver,
} from "../../library/performance";
import { UserCommands } from "../../library/userCommands";
import { showLog } from "./logging";

UserCommands.register(
  {
    command: "qcfg.perf.dumpHistograms",
    title: "Dump performance histograms",
    callback: () => {
      dumpPerfHistograms();
      showLog();
    },
  },
  {
    command: "qcfg.perf.startObserver",
    title: "Start performance observer",
    callback: () => {
      startPerfObserver();
    },
  },
  {
    command: "qcfg.perf.resetHistograms",
    title: "Reset performance histograms",
    callback: () => {
      resetPerfHistograms();
    },
  },
);
