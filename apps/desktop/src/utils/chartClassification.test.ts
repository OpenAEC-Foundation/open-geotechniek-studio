import {expect,it} from "vitest";
import {classifyRobertson} from "../components/chart/chart-renderer";
it.each([[.5,2,2],[.5,5,1],[1,1,3],[1,3,2],[3,8,2]])("chart and native soil zone agree at qc=%s rf=%s",(qc,rf,zone)=>expect(classifyRobertson(qc,rf)?.zone).toBe(zone));
