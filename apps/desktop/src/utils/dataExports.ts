import type { Cpt, MeasurementPoint } from "../types/cpt";

/** Portable counterpart of the native CPT serializers. */
export function cptToGef(cpt: Cpt): string {
  const safe = (value: string) => value.replace(/[\r\n]/g, " ");
  const fields: { field: keyof MeasurementPoint; unit: string; quantity: number; label: string }[] = [
    { field: "depth", unit: "m", quantity: 1, label: "sondeertrajectlengte" },
    { field: "depth", unit: "m", quantity: 11, label: "diepte" },
    { field: "qc", unit: "MPa", quantity: 2, label: "conusweerstand" },
    { field: "fs", unit: "MPa", quantity: 3, label: "plaatselijke wrijving" },
    { field: "rf", unit: "%", quantity: 4, label: "wrijvingsgetal" },
    { field: "u2", unit: "MPa", quantity: 6, label: "waterspanning" },
    { field: "inclination", unit: "graden", quantity: 8, label: "helling" },
  ];
  const header = ["#GEFID= 1, 1, 0", `#COLUMN= ${fields.length}`];
  fields.forEach((f, i) => header.push(`#COLUMNINFO= ${i + 1}, ${f.unit}, ${f.label}, ${f.quantity}`, `#COLUMNVOID= ${i + 1}, -999999`));
  header.push("#COLUMNSEPARATOR= ;", "#COLUMNTEXT= 0, uit", "#FILEOWNER= Open Geotechniek Studio",
    `#LASTSCAN= ${cpt.points.length}`, `#PROJECTID= ${safe(cpt.metadata.project_number ?? "")}`,
    "#RECORDSEPARATOR= !", "#REPORTCODE= GEF-CPT-Report, 1, 1, 2", `#TESTID= ${safe(cpt.id)}`);
  if (cpt.metadata.date) header.push(`#STARTDATE= ${safe(cpt.metadata.date).split("-").join(", ")}`);
  if (cpt.metadata.project_name) header.push(`#PROJECTNAME= ${safe(cpt.metadata.project_name)}`);
  if (cpt.metadata.equipment) header.push(`#COMPANYID= ${safe(cpt.metadata.equipment)}`);
  if (cpt.position) header.push(`#XYID= 31000, ${cpt.position.x_rd}, ${cpt.position.y_rd}`);
  const z = cpt.position?.z_nap ?? cpt.metadata.ground_level_nap;
  if (z !== undefined) header.push(`#ZID= 31000, ${z}`);
  header.push("#EOH=");
  return header.join("\n") + "\n" + cpt.points.map(p => fields.map(f => p[f.field] ?? -999999).join(";") + ";!\n").join("");
}

/** BRO-style exchange XML, matching the native export; not a BRO registration submission. */
export function cptToBroXml(cpt: Cpt): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const z = cpt.position?.z_nap ?? cpt.metadata.ground_level_nap;
  const rows = cpt.points.map(p => {
    const row = Array<number>(25).fill(-999999);
    row[0] = row[1] = p.depth;
    row[3] = p.qc ?? -999999; row[15] = p.inclination ?? -999999;
    row[18] = p.fs ?? -999999; row[22] = p.u2 ?? -999999; row[24] = p.rf ?? -999999;
    return row.join(",");
  }).join(";");
  return `<?xml version="1.0" encoding="UTF-8"?>
<dispatchDataResponse xmlns="http://www.broservices.nl/xsd/dscpt/1.1" xmlns:brocom="http://www.broservices.nl/xsd/brocommon/3.0" xmlns:cptcommon="http://www.broservices.nl/xsd/cptcommon/1.1" xmlns:gml="http://www.opengis.net/gml/3.2">
  <brocom:responseType>dispatch</brocom:responseType>
  <dispatchDocument><CPT_O gml:id="OGS_0001">
    <brocom:broId>${escape(cpt.id)}</brocom:broId>
    ${cpt.metadata.date ? `<researchReportDate><brocom:date>${escape(cpt.metadata.date)}</brocom:date></researchReportDate>` : ""}
    ${cpt.position ? `<deliveredLocation><cptcommon:location srsName="urn:ogc:def:crs:EPSG::28992" gml:id="OGS_LOC_0001"><gml:pos>${cpt.position.x_rd} ${cpt.position.y_rd}</gml:pos></cptcommon:location></deliveredLocation>` : ""}
    ${z !== undefined ? `<deliveredVerticalPosition><cptcommon:offset uom="m">${z}</cptcommon:offset><cptcommon:verticalDatum>NAP</cptcommon:verticalDatum></deliveredVerticalPosition>` : ""}
    <conePenetrometerSurvey><cptcommon:conePenetrationTest><cptcommon:cptResult><cptcommon:values>${rows}</cptcommon:values></cptcommon:cptResult></cptcommon:conePenetrationTest></conePenetrometerSurvey>
  </CPT_O></dispatchDocument>
</dispatchDataResponse>\n`;
}

export function cptToCsv(cpt: Cpt): string {
  const fields: (keyof MeasurementPoint)[] = ["depth", "depth_nap", "qc", "fs", "rf", "u2", "inclination"];
  return fields.join(",") + "\n" + cpt.points.map(p => fields.map(key => p[key] ?? "").join(",")).join("\n") + (cpt.points.length ? "\n" : "");
}

export function cptsToGeoJson(cpts: Cpt[]) {
  return { type: "FeatureCollection", features: cpts.flatMap(cpt => {
    if (!cpt.position) return [];
    const { lat, lon } = rdToWgs84(cpt.position.x_rd, cpt.position.y_rd);
    return [{ type: "Feature", properties: {
      id: cpt.id, z_nap: cpt.position.z_nap ?? null,
      max_depth: cpt.points.reduce((max, p) => Math.max(max, p.depth), 0),
      date: cpt.metadata.date ?? null, source_file: cpt.metadata.source_file,
    }, geometry: { type: "Point", coordinates: [lon, lat] } }];
  }) };
}

// RD to WGS84 polynomial, shared convention with the native export command.
function rdToWgs84(x: number, y: number): { lat: number; lon: number } {
  const X0 = 155_000.0, Y0 = 463_000.0;
  const PHI0 = 52.15517440, LAM0 = 5.38720621;
  const dx = (x - X0) * 1e-5;
  const dy = (y - Y0) * 1e-5;
  const kp: [number, number, number][] = [
    [0, 1, 3235.65389], [2, 0, -32.58297], [0, 2, -0.24750], [2, 1, -0.84978],
    [0, 3, -0.06550], [2, 2, -0.01709], [1, 0, -0.00738], [4, 0, 0.00530],
    [2, 3, -0.00039], [4, 1, 0.00033], [1, 1, -0.00012],
  ];
  const lp: [number, number, number][] = [
    [1, 0, 5260.52916], [1, 1, 105.94684], [1, 2, 2.45656], [3, 0, -0.81885],
    [1, 3, 0.05594], [3, 1, -0.05607], [0, 1, 0.01199], [3, 2, -0.00256],
    [1, 4, 0.00128], [0, 2, 0.00022], [2, 0, -0.00022], [5, 0, 0.00026],
  ];
  let dphi = 0, dlam = 0;
  for (const [p, q, k] of kp) dphi += k * Math.pow(dx, p) * Math.pow(dy, q);
  for (const [p, q, l] of lp) dlam += l * Math.pow(dx, p) * Math.pow(dy, q);
  return { lat: PHI0 + dphi / 3600, lon: LAM0 + dlam / 3600 };
}
