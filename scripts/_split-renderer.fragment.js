function rrSplitRender(e){
  const {
    t: n,
    months: r,
    rows: a,
    onRowClick: i,
    emptyText: s,
    totals: c,
    styles: d,
    onSort: m
  } = e;

  const g = A.useMemo(
    () => ["n", "tenant", "contract", "area", "indicator", ...r.flatMap((y) => ["m" + y + "c", "m" + y + "p"]), "debt"],
    [r]
  );

  const [b, w] = A.useState(() => {
    try {
      const y = localStorage.getItem("rr-split-cols-v3");
      if (y) return JSON.parse(y);
    } catch {}
    return {};
  });

  const [x, v] = A.useState(() => {
    try {
      const y = Number(localStorage.getItem("rr-split-row-h"));
      if (y >= 22 && y <= 64) return y;
    } catch {}
    return 28;
  });

  const S = A.useCallback(
    (y, h) => (j) => {
      j.preventDefault();
      j.stopPropagation();
      const E = b[y] ?? h;
      const P = j.clientX;
      const O = (T) => {
        const M = Math.max(48, Math.min(420, E + (T.clientX - P)));
        w((R) => ({ ...R, [y]: M }));
      };
      const T = () => {
        document.removeEventListener("mousemove", O);
        document.removeEventListener("mouseup", T);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        w((M) => {
          try {
            localStorage.setItem("rr-split-cols-v3", JSON.stringify(M));
          } catch {}
          return M;
        });
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", O);
      document.addEventListener("mouseup", T);
    },
    [b]
  );

  const k = A.useCallback(() => {
    const y = x;
    return (h) => {
      h.preventDefault();
      h.stopPropagation();
      const j = h.clientY;
      const E = (P) => {
        v(Math.max(22, Math.min(56, y + (P.clientY - j))));
      };
      const P = () => {
        document.removeEventListener("mousemove", E);
        document.removeEventListener("mouseup", P);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        v((O) => {
          try {
            localStorage.setItem("rr-split-row-h", String(O));
          } catch {}
          return O;
        });
      };
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", E);
      document.addEventListener("mouseup", P);
    };
  }, [x]);

  const j = (y) => {
    const h = Number(y);
    return Number.isFinite(h) ? h.toFixed(2) : "0.00";
  };

  const E = (y) => {
    let h = 0;
    const P = y.months || {};
    for (const O of Object.keys(P)) {
      const T = P[O];
      h += Math.max(0, Number((T == null ? void 0 : T.utility) || 0) - Number((T == null ? void 0 : T.utilityPaid) || 0));
    }
    return Math.round(h * 100) / 100;
  };

  const P = (y) => Math.round((Number(y.debt || 0) + E(y)) * 100) / 100;

  const totalArea = A.useMemo(
    () => Math.round(a.reduce((y, h) => y + Number(h.area || 0), 0) * 100) / 100,
    [a]
  );
  const totalDebt = A.useMemo(() => Math.round(a.reduce((y, h) => y + P(h), 0) * 100) / 100, [a]);
  const totalUtilCharged = A.useMemo(
    () =>
      Math.round(
        r.reduce((y, h) => {
          var z;
          return y + Number(((z = c.monthTotals[h]) == null ? void 0 : z.utility) || 0);
        }, 0) * 100
      ) / 100,
    [r, c]
  );
  const totalUtilPaid = A.useMemo(
    () =>
      Math.round(
        r.reduce((y, h) => {
          var z;
          return y + Number(((z = c.monthTotals[h]) == null ? void 0 : z.utilityPaid) || 0);
        }, 0) * 100
      ) / 100,
    [r, c]
  );

  const O = { n: 44, tenant: 190, contract: 140, area: 96, indicator: 78, debt: 104 };
  const T = (y) => b[y] ?? (String(y).startsWith("m") ? 72 : O[y] ?? 80);
  const M = r.length ? 5 + r.length * 2 + 1 : 6;

  const cls = (...parts) => parts.filter(Boolean).join(" ");

  const th = (key, className, label, align) =>
    u.jsxs("th", {
      rowSpan: 2,
      className: cls(className, d.thResizable),
      style: {
        width: T(key),
        minWidth: T(key),
        maxWidth: T(key),
        position: "relative",
        textAlign: align || "left",
      },
      children: [
        u.jsx("button", {
          type: "button",
          className: d.splitSortBtn,
          onClick: () => m && m(key),
          children: label,
        }),
        u.jsx("span", {
          className: d.colResizeHandle,
          role: "separator",
          "aria-orientation": "vertical",
          onMouseDown: S(key, T(key)),
        }),
      ],
    });

  const summaryRows =
    a.length > 0
      ? [
          u.jsxs("tr", {
            key: "sum-rent",
            className: d.totalRow,
            children: [
              u.jsx("td", { rowSpan: 2, className: d.numCol }),
              u.jsx("td", {
                rowSpan: 2,
                colSpan: 2,
                className: d.totalLabel,
                children: n("rentRegister.totalRow"),
              }),
              u.jsxs("td", {
                rowSpan: 2,
                className: d.numCell,
                title: n("rentRegister.colArea"),
                children: [
                  totalArea.toLocaleString("ru-RU", { maximumFractionDigits: 2 }),
                  " ",
                  n("common.sqm"),
                ],
              }),
              u.jsx("td", { className: d.indicatorCell, children: n("rentRegister.indicatorRent") }),
              r.map((y) => {
                var h;
                return u.jsxs(
                  A.Fragment,
                  {
                    children: [
                      u.jsx("td", {
                        className: d.numCell,
                        children: j((h = c.monthTotals[y]) == null ? void 0 : h.rent),
                      }),
                      u.jsx("td", {
                        className: d.numCell,
                        children: j((h = c.monthTotals[y]) == null ? void 0 : h.paid),
                      }),
                    ],
                  },
                  "tr-" + y
                );
              }),
              u.jsx("td", {
                rowSpan: 2,
                className: cls(d.numCell, d.debtCell),
                title: n("common.debt"),
                children: j(totalDebt),
              }),
            ],
          }),
          u.jsxs("tr", {
            key: "sum-util",
            className: d.totalRow,
            children: [
              u.jsx("td", {
                className: d.indicatorCell,
                title:
                  n("rentRegister.indicatorUtil") +
                  ": " +
                  j(totalUtilCharged) +
                  " / " +
                  j(totalUtilPaid),
                children: n("rentRegister.indicatorUtil"),
              }),
              r.map((y) => {
                var h;
                return u.jsxs(
                  A.Fragment,
                  {
                    children: [
                      u.jsx("td", {
                        className: d.numCell,
                        children: j((h = c.monthTotals[y]) == null ? void 0 : h.utility),
                      }),
                      u.jsx("td", {
                        className: d.numCell,
                        children: j((h = c.monthTotals[y]) == null ? void 0 : h.utilityPaid),
                      }),
                    ],
                  },
                  "tu-" + y
                );
              }),
            ],
          }),
        ]
      : [];

  return u.jsxs("div", {
    className: d.splitWrap,
    children: [
      u.jsxs("table", {
        className: cls(d.splitTable, d.splitTableFixed),
        style: { "--rr-row-h": x + "px" },
        children: [
          u.jsx("colgroup", {
            children: g.map((y) => u.jsx("col", { style: { width: T(y) } }, y)),
          }),
          u.jsxs("thead", {
            children: [
              u.jsxs("tr", {
                children: [
                  th("n", d.numCol, "№", "center"),
                  th("tenant", null, n("rentRegister.colTenant")),
                  th("contract", null, n("rentRegister.colContract")),
                  th("area", d.numCell, n("rentRegister.colArea"), "right"),
                  u.jsxs("th", {
                    rowSpan: 2,
                    className: cls(d.indicatorCol, d.thResizable),
                    style: {
                      width: T("indicator"),
                      minWidth: T("indicator"),
                      maxWidth: T("indicator"),
                      position: "relative",
                    },
                    children: [
                      n("rentRegister.colIndicator"),
                      u.jsx("span", {
                        className: d.colResizeHandle,
                        role: "separator",
                        "aria-orientation": "vertical",
                        onMouseDown: S("indicator", T("indicator")),
                      }),
                    ],
                  }),
                  r.map((y) =>
                    u.jsxs(
                      "th",
                      {
                        colSpan: 2,
                        className: d.monthGroup,
                        style: { width: T("m" + y + "c") + T("m" + y + "p"), position: "relative" },
                        children: [
                          or(n, y),
                          u.jsx("span", {
                            className: d.colResizeHandle,
                            role: "separator",
                            "aria-orientation": "vertical",
                            onMouseDown: S("m" + y + "c", T("m" + y + "c")),
                          }),
                        ],
                      },
                      y
                    )
                  ),
                  th("debt", d.numCell, n("common.debt"), "right"),
                ],
              }),
              u.jsx("tr", {
                children: r.map((y) =>
                  u.jsxs(
                    A.Fragment,
                    {
                      children: [
                        u.jsxs("th", {
                          className: cls(d.subCol, d.thResizable),
                          style: {
                            width: T("m" + y + "c"),
                            minWidth: T("m" + y + "c"),
                            maxWidth: T("m" + y + "c"),
                            position: "relative",
                          },
                          children: [
                            u.jsx("button", {
                              type: "button",
                              className: d.splitSortBtn,
                              onClick: () => m && m("r" + y),
                              children: n("rentRegister.chargedShort"),
                            }),
                            u.jsx("span", {
                              className: d.colResizeHandle,
                              role: "separator",
                              "aria-orientation": "vertical",
                              onMouseDown: S("m" + y + "c", T("m" + y + "c")),
                            }),
                          ],
                        }),
                        u.jsxs("th", {
                          className: cls(d.subCol, d.thResizable),
                          style: {
                            width: T("m" + y + "p"),
                            minWidth: T("m" + y + "p"),
                            maxWidth: T("m" + y + "p"),
                            position: "relative",
                          },
                          children: [
                            u.jsx("button", {
                              type: "button",
                              className: d.splitSortBtn,
                              onClick: () => m && m("pd" + y),
                              children: n("rentRegister.paidShort"),
                            }),
                            u.jsx("span", {
                              className: d.colResizeHandle,
                              role: "separator",
                              "aria-orientation": "vertical",
                              onMouseDown: S("m" + y + "p", T("m" + y + "p")),
                            }),
                          ],
                        }),
                      ],
                    },
                    y
                  )
                ),
              }),
            ],
          }),
          u.jsx("tbody", {
            children:
              a.length === 0
                ? u.jsx("tr", { children: u.jsx("td", { colSpan: M, className: d.emptyCell, children: s }) })
                : [
                    ...summaryRows,
                    ...a.map((y, h) => {
                      const N = P(y);
                      return u.jsxs(
                        A.Fragment,
                        {
                          children: [
                            u.jsxs("tr", {
                              className: cls(d.splitRow, h % 2 ? d.splitPairAlt : ""),
                              onClick: () => i(y),
                              children: [
                                u.jsx("td", { rowSpan: 2, className: d.numCol, children: y.rowNum }),
                                u.jsx("td", {
                                  rowSpan: 2,
                                  className: d.tenantCell,
                                  title: y.tenantName,
                                  children: y.tenantName,
                                }),
                                u.jsx("td", {
                                  rowSpan: 2,
                                  className: d.contractCell,
                                  title: y.contractLabel || "",
                                  children: y.contractLabel || "—",
                                }),
                                u.jsxs("td", {
                                  rowSpan: 2,
                                  className: d.numCell,
                                  children: [
                                    Number(y.area || 0).toLocaleString("ru-RU", {
                                      maximumFractionDigits: 2,
                                    }),
                                    " ",
                                    n("common.sqm"),
                                  ],
                                }),
                                u.jsx("td", {
                                  className: d.indicatorCell,
                                  children: n("rentRegister.indicatorRent"),
                                }),
                                r.map((z) => {
                                  var L;
                                  return u.jsxs(
                                    A.Fragment,
                                    {
                                      children: [
                                        u.jsx("td", {
                                          className: d.numCell,
                                          children: j((L = y.months[z]) == null ? void 0 : L.rent),
                                        }),
                                        u.jsx("td", {
                                          className: d.numCell,
                                          children: j((L = y.months[z]) == null ? void 0 : L.paid),
                                        }),
                                      ],
                                    },
                                    "r" + y.rowNum + "-" + z
                                  );
                                }),
                                u.jsx("td", {
                                  rowSpan: 2,
                                  className: cls(d.numCell, d.debtCell),
                                  children: j(N),
                                }),
                              ],
                            }),
                            u.jsxs("tr", {
                              className: cls(d.splitRow, d.splitRowAlt, h % 2 ? d.splitPairAlt : ""),
                              onClick: () => i(y),
                              children: [
                                u.jsx("td", {
                                  className: d.indicatorCell,
                                  children: n("rentRegister.indicatorUtil"),
                                }),
                                r.map((z) => {
                                  var L;
                                  return u.jsxs(
                                    A.Fragment,
                                    {
                                      children: [
                                        u.jsx("td", {
                                          className: d.numCell,
                                          children: j(
                                            (L = y.months[z]) == null ? void 0 : L.utility
                                          ),
                                        }),
                                        u.jsx("td", {
                                          className: d.numCell,
                                          children: j(
                                            (L = y.months[z]) == null ? void 0 : L.utilityPaid
                                          ),
                                        }),
                                      ],
                                    },
                                    "u" + y.rowNum + "-" + z
                                  );
                                }),
                              ],
                            }),
                          ],
                        },
                        y.rowNum
                      );
                    }),
                  ],
          }),
        ],
      }),
      u.jsx("div", {
        className: d.rowResizeBar,
        onMouseDown: k(),
        title: n("rentRegister.resizeRows"),
      }),
    ],
  });
}
