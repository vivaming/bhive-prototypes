/* Generated from legacy-curia-fixture.json by scripts/chart-fixture-sync.mjs. */
(function(root){
  root.BIHIVE_CHART_SPEC = {
    "schemaVersion": 1,
    "specId": "legacy-poll-series-demo",
    "datasetId": "legacy-poll-snapshot-demo",
    "datasetHash": "c99e2c06b59793f26d1d26d40e7afaf4cf81315f24e413e73da94c2f179d3cc9",
    "question": "What pattern does the legacy prototype display for National and Labour party-vote support?",
    "unit": "percent of party vote",
    "period": {
      "displayLabels": [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep"
      ],
      "displayRange": "Jan–Sep 2026 as shown by the legacy prototype",
      "observationDates": null,
      "note": "Per-wave survey dates and fieldwork periods are absent from the repository. These labels are preserved prototype labels, not verified observation dates."
    },
    "templateId": "line-time-series",
    "snapshotView": {
      "templateId": "horizontal-bar",
      "seriesIds": [
        "national",
        "labour",
        "green",
        "act",
        "nzfirst",
        "opp"
      ],
      "scalePolicy": {
        "kind": "zero-baseline",
        "domain": [
          0,
          45
        ],
        "baseline": 0
      }
    },
    "scalePolicy": {
      "kind": "fixed-domain",
      "domain": [
        20,
        42
      ],
      "baseline": null,
      "reason": "Line chart; non-zero domain is explicitly shown and retained from the legacy prototype."
    },
    "dataset": {
      "partySnapshot": [
        {
          "id": "national",
          "label": "National",
          "color": "#5a94d4",
          "value": 29,
          "reachesThreshold": true
        },
        {
          "id": "labour",
          "label": "Labour",
          "color": "#D82A20",
          "value": 25.9,
          "reachesThreshold": true
        },
        {
          "id": "green",
          "label": "Green",
          "color": "#3d9e5c",
          "value": 13.9,
          "reachesThreshold": true
        },
        {
          "id": "act",
          "label": "ACT",
          "color": "#c9b026",
          "value": 10.5,
          "reachesThreshold": true
        },
        {
          "id": "nzfirst",
          "label": "NZ First",
          "color": "#8895a7",
          "value": 8.4,
          "reachesThreshold": true
        },
        {
          "id": "opp",
          "label": "Opportunity Party",
          "color": "#5b6472",
          "value": 4.5,
          "reachesThreshold": false
        }
      ],
      "series": [
        {
          "id": "national",
          "label": "National",
          "color": "#5a94d4",
          "trendVisible": true,
          "values": [
            31.5,
            31.3,
            28.4,
            29.8,
            30,
            30.1,
            30.5,
            31,
            29
          ]
        },
        {
          "id": "labour",
          "label": "Labour",
          "color": "#D82A20",
          "trendVisible": true,
          "values": [
            34.4,
            34.1,
            34.4,
            33.4,
            31.9,
            32.2,
            31.5,
            27.8,
            25.9
          ]
        },
        {
          "id": "green",
          "label": "Green",
          "color": "#3d9e5c",
          "trendVisible": false,
          "values": [
            7.7,
            10.3,
            10.5,
            7.8,
            9.7,
            11.5,
            10.4,
            10.1,
            13.9
          ]
        },
        {
          "id": "act",
          "label": "ACT",
          "color": "#c9b026",
          "trendVisible": false,
          "values": [
            7,
            6.7,
            7.5,
            9,
            6.5,
            7.8,
            6.9,
            7.3,
            10.5
          ]
        },
        {
          "id": "nzfirst",
          "label": "NZ First",
          "color": "#8895a7",
          "trendVisible": false,
          "values": [
            11.9,
            10.5,
            9.7,
            13.6,
            11.7,
            11.4,
            10.8,
            9.1,
            8.4
          ]
        }
      ]
    },
    "annotations": [],
    "sourceIds": [],
    "provenance": {
      "status": "UNVERIFIED_LEGACY_FIXTURE",
      "claimedSourceLabel": "Curia poll, 3 September 2026 (label retained from the prototype)",
      "sourceUrl": null,
      "sourceRecordPath": null,
      "reason": "The repository contains no source page/snapshot, fieldwork dates, sample/method details, or per-observation mapping. Values are copied verbatim from the legacy prototype solely to exercise its chart."
    },
    "themeVersion": "bihive-chart-v1",
    "rendererVersion": "d3-7.9.0",
    "releaseGate": "HOLD"
  };
})(typeof window!=="undefined"?window:globalThis);
