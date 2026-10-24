import { test, expect } from "@playwright/test";
test("los campos de fecha y mes abren el calendario al pulsar el cuerpo del campo", async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLInputElement.prototype.showPicker = function () {
      this.dataset.pickerRequested = "true";
    };
  });
  await page.goto("/auth/revision");
  for (const label of ["Desde", "Hasta"]) {
    const input = page.getByRole("textbox", { name: label, exact: true });
    await input.click({ position: { x: 24, y: 20 } });
    await expect(input).toHaveAttribute("data-picker-requested", "true");
  }
  const quick = page.getByRole("button", {
    name: "Nuevo movimiento",
    exact: true,
  });
  await expect(quick).toHaveText("");
  await quick.click();
  const date = page.getByRole("dialog").getByLabel("Fecha", { exact: true });
  await date.click({ position: { x: 24, y: 20 } });
  await expect(date).toHaveAttribute("data-picker-requested", "true");
  await page.keyboard.press("Escape");
  await page.goto("/auth/revision?screen=presupuesto");
  const month = page.getByLabel("Mes del presupuesto", { exact: true });
  await month.click({ position: { x: 24, y: 20 } });
  await expect(month).toHaveAttribute("data-picker-requested", "true");
  await page.goto("/auth/revision?screen=recurrentes");
  for (const label of ["Fecha de inicio", "Fecha final"]) {
    const input = page.getByRole("textbox", { name: label, exact: true });
    await input.click({ position: { x: 24, y: 20 } });
    await expect(input).toHaveAttribute("data-picker-requested", "true");
  }
});

test("los campos obligatorios muestran asterisco y las cuentas tienen separación", async ({
  page,
}) => {
  await page.goto("/auth/revision");
  await page
    .getByRole("button", { name: "Nuevo movimiento", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Nuevo movimiento",
    exact: true,
  });
  await expect(modal.locator('label[for="amount"]')).toContainText("*");
  await expect(
    modal.getByRole("group", { name: "Categoría" }).locator("legend"),
  ).toContainText("*");
  for (const name of ["description", "occurredOn", "accountId"]) {
    await expect(modal.locator(`label[for="${name}"]`)).not.toContainText("*");
  }
  await expect(modal.getByText("Vacío = hoy", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/movimiento-formulario.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.goto("/auth/revision?screen=cuentas");
  const cards = page
    .getByRole("list", { name: "Cuentas", exact: true })
    .locator(":scope > li");
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(second!.y - first!.y - first!.height).toBeGreaterThanOrEqual(16);
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Nueva cuenta" });
  await expect(form.locator('label[for="name"]')).toContainText("*");
  await expect(form.locator('label[for="type"]')).toContainText("*");
  await expect(form.locator('label[for="initialBalance"]')).not.toContainText(
    "*",
  );
});

test("limpiar selecciones conserva las fechas y las fechas manuales sustituyen el acceso rápido", async ({
  page,
}) => {
  await page.goto("/auth/revision");
  await expect(
    page.getByRole("link", { name: "Limpiar filtros", exact: true }),
  ).toHaveCount(0);
  await page.goto(
    "/auth/revision?periodo=7d&cuenta=00000000-0000-4000-8000-000000000010&categoria=00000000-0000-4000-8000-000000000001",
  );
  await expect(
    page.getByRole("textbox", { name: "Desde", exact: true }),
  ).toHaveValue("2026-10-18");
  await page
    .getByRole("link", { name: "Limpiar filtros", exact: true })
    .click();
  await expect(page).toHaveURL(/periodo=7d/);
  await expect(page).not.toHaveURL(/cuenta=|categoria=/);
  await expect(
    page.getByRole("link", { name: "Limpiar filtros", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Hasta", exact: true }),
  ).toHaveValue("2026-10-24");
  await page
    .getByRole("textbox", { name: "Desde", exact: true })
    .fill("2026-10-03");
  await page
    .getByRole("textbox", { name: "Hasta", exact: true })
    .fill("2026-10-11");
  await expect(
    page.getByRole("link", { name: "7 días", exact: true }),
  ).not.toHaveAttribute("aria-current", "true");
  await page
    .getByRole("button", { name: "Aplicar filtros", exact: true })
    .click();
  await expect(page).toHaveURL(/periodo=rango/);
  await expect(page).toHaveURL(/desde=2026-10-03/);
  await expect(page).toHaveURL(/hasta=2026-10-11/);
});
test("seleccionar fechas en el gráfico actualiza el rango global, en ambos sentidos", async ({
  page,
}) => {
  await page.goto("/auth/revision");
  for (const [start, end] of [
    [4, 10],
    [10, 4],
  ]) {
    const chart = page.getByRole("img", { name: /Gastos por día/ });
    await expect(chart.locator(".recharts-line").first()).toBeVisible();
    await chart.scrollIntoViewIfNeeded();
    const bounds = await chart.boundingBox();
    const first = await chart
      .locator(
        ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
      )
      .filter({ hasText: new RegExp("^" + start + "$") })
      .boundingBox();
    const last = await chart
      .locator(
        ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
      )
      .filter({ hasText: new RegExp("^" + end + "$") })
      .boundingBox();
    const y = bounds!.y + 80;
    await page.mouse.move(first!.x + first!.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(last!.x + last!.width / 2, y, { steps: 8 });
    await expect(chart.locator(".recharts-reference-area")).toBeVisible();
    const tooltip = chart.locator(".recharts-tooltip-wrapper");
    await expect(tooltip.getByText("Inicio", { exact: true })).toBeVisible();
    await expect(tooltip.getByText("Fin", { exact: true })).toBeVisible();
    await expect(tooltip.locator('time[datetime="2026-10-04"]')).toBeVisible();
    await expect(tooltip.locator('time[datetime="2026-10-10"]')).toBeVisible();
    if (start < end)
      await page.screenshot({ path: "test-results/seleccion-fechas.png" });
    await page.mouse.up();
    await expect(page).toHaveURL(/auth\/revision\?/);
    await expect(page).toHaveURL(/periodo=rango/);
    await expect(
      page.getByRole("textbox", { name: "Desde", exact: true }),
    ).toHaveValue("2026-10-04");
    await expect(
      page.getByRole("textbox", { name: "Hasta", exact: true }),
    ).toHaveValue("2026-10-10");
    await page.goBack();
    await expect(
      page.getByRole("textbox", { name: "Desde", exact: true }),
    ).toHaveValue("2026-10-01");
  }
});
test("los gráficos muestran el rango completo sin barra inferior ni controles de zoom", async ({
  page,
}) => {
  await page.goto("/auth/revision");
  const chart = page.getByRole("img", { name: /Gastos por día/ });
  await expect(chart.locator(".recharts-line").first()).toBeVisible();
  await expect(page.locator(".recharts-brush")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mostrar todo el rango" }),
  ).toHaveCount(0);
  await expect(chart.locator(".recharts-xAxis-tick-labels")).toContainText(
    "24",
  );
});
test("el mes del presupuesto cambia al elegirlo y conserva el documento abierto", async ({
  page,
}) => {
  await page.goto("/auth/revision?screen=presupuesto");
  await expect(
    page.getByRole("button", { name: "Ver mes", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    document.documentElement.dataset.monthNavigation = "preserved";
  });
  await page.getByLabel("Mes del presupuesto", { exact: true }).fill("2026-11");
  await expect(page).toHaveURL(/mes=2026-11/);
  await expect(
    page.getByLabel("Mes del presupuesto", { exact: true }),
  ).toHaveValue("2026-11");
  await expect(page.locator("html")).toHaveAttribute(
    "data-month-navigation",
    "preserved",
  );
  await page.goBack();
  await expect(
    page.getByLabel("Mes del presupuesto", { exact: true }),
  ).toHaveValue("2026-10");
});
test("fechas directas, todas las categorías y todas las cuentas", async ({
  page,
}) => {
  await page.goto("/auth/revision");
  await expect(
    page.getByRole("textbox", { name: "Desde", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Hasta", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Período", exact: true }),
  ).toHaveCount(0);
  await page
    .locator("summary")
    .filter({ hasText: /^Categorías:/ })
    .click();
  await page.getByRole("checkbox", { name: "Comida", exact: true }).check();
  await expect(
    page.getByRole("checkbox", { name: "Todas las categorías", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("checkbox", { name: "Todas las categorías", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", { name: "Comida", exact: true }),
  ).not.toBeChecked();
  await page
    .locator("summary")
    .filter({ hasText: /^Categorías:/ })
    .click();
  await page
    .locator("summary")
    .filter({ hasText: /^Cuentas:/ })
    .click();
  await page.getByRole("checkbox", { name: "BCP Débito", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "Todas las cuentas", exact: true })
    .check();
  await page
    .locator("summary")
    .filter({ hasText: /^Cuentas:/ })
    .click();
  await page
    .getByRole("button", { name: "Aplicar filtros", exact: true })
    .click();
  await expect(page).toHaveURL(/periodo=mes/);
  await expect(page).not.toHaveURL(/categoria=|cuenta=/);
});
test("perfil: claro por defecto, oscuro y sistema actualizan también los gráficos", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/auth/revision?screen=perfil");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("radio", { name: /Oscuro/ }).check();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: /Claro/ }).check();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("radio", { name: /Del sistema/ }).check();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.screenshot({
    path: "test-results/perfil-desktop.png",
    fullPage: true,
    caret: "initial",
  });
});
test("creación de movimientos, transferencias y categorías abre ventanas modales", async ({
  page,
}) => {
  await page.goto("/auth/revision");
  await page
    .getByRole("button", { name: "Nuevo movimiento", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Nuevo movimiento", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/auth/revision?screen=cuentas");
  await page
    .getByRole("button", { name: "Transferir entre cuentas", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Transferir entre cuentas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Desde", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/auth/revision?screen=categorias");
  await page.getByRole("tab", { name: /Ingresos/ }).click();
  await page
    .getByRole("button", { name: "+ Crear categoría", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Nueva categoría de ingresos",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Nombre", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});
test("resumen: agrupación, leyenda, filtro y regreso mantienen su contexto", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/auth/revision");
  await expect(
    page.getByRole("heading", { name: "Tu dinero, con claridad" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await expect(page).toHaveURL(/agrupacion=week/);
  await expect(
    page.getByRole("button", { name: "Semana", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Día", exact: true }).click();
  await expect(page).toHaveURL(/agrupacion=day/);
  await page
    .getByRole("button", { name: "Por categoría", exact: true })
    .click();
  await expect(page.getByLabel("Leyenda interactiva")).toBeVisible();
  const legend = page
    .getByLabel("Leyenda interactiva")
    .getByRole("button", { name: "Comida", exact: true });
  await legend.click();
  await expect(legend).toHaveAttribute("aria-pressed", "false");
  await legend.click();
  await expect(legend).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Comida.*%/ }).click();
  await expect(page).toHaveURL(/categoria=/);
  await expect(
    page.locator("span").getByText("Ingresos", { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/categoria=/);
  await page
    .getByText("Ver valores y movimientos por intervalo", { exact: true })
    .click();
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(25);
  await expect(
    table.getByRole("link", { name: "Ver movimientos →" }).first(),
  ).toHaveAttribute("href", /desde=2026-10-01/);
  expect(errors).toEqual([]);
  await expect(page.locator(".recharts-line").first()).toBeVisible();
  await page.goto("/auth/revision");
  await expect(page.locator(".recharts-line").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/resumen-desktop.png",
    fullPage: true,
    caret: "initial",
  });
});
test("cuentas: creación amplia, modal accesible y cuentas deshabilitadas", async ({
  page,
}) => {
  await page.goto("/auth/revision?screen=cuentas");
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const create = page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear cuenta", exact: true });
  const box = await create.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThan(150);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Deshabilitadas", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Cuenta anterior", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Activas", exact: true }).click();
  await page.screenshot({
    path: "test-results/cuentas-desktop.png",
    fullPage: true,
    caret: "initial",
  });
});
test("presupuesto: base fija, avance y exceso, suma máxima y copia", async ({
  page,
}) => {
  await page.goto("/auth/revision?screen=presupuesto");
  await page
    .getByRole("button", { name: "Editar presupuesto", exact: true })
    .click();
  await expect(page.getByLabel("Total previsto mensual (S/)")).toHaveValue(
    "5000.00",
  );
  await expect(
    page.getByRole("dialog").getByText(/106,?\.?7 % utilizado/),
  ).toBeVisible();
  await page.getByLabel("Porcentaje para Comida").fill("90");
  await expect(
    page.getByRole("alert").filter({ hasText: "supera el 100" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Guardar presupuesto" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Copiar distribución anterior" })
    .click();
  await expect(page.getByLabel("Porcentaje para Comida")).toHaveValue("30");
  await expect(
    page.getByRole("button", { name: "Guardar presupuesto" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/presupuesto-desktop.png",
    fullPage: true,
    caret: "initial",
  });
});
test("inversiones: aporte, rescate y valor tienen formularios distintos", async ({
  page,
}) => {
  await page.goto("/auth/revision?screen=inversiones");
  await page
    .getByRole("button", { name: "Registrar aporte", exact: true })
    .click();
  await expect(
    page.getByText(/El aporte se descuenta una sola vez/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Actualizar valor", exact: true })
    .click();
  await expect(
    page.getByText(/Actualizar el valor no crea un aporte/),
  ).toBeVisible();
  await expect(
    page.getByText("Cuenta de origen", { exact: true }),
  ).not.toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Saldo inicial", exact: true })
    .click();
  await expect(
    page.getByLabel("Capital aportado antes de usar la app"),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/inversiones-desktop.png",
    fullPage: true,
    caret: "initial",
  });
});
test("móvil y modo oscuro: pantallas sin desbordamiento y navegación completa", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const screen of [
    "resumen",
    "cuentas",
    "inversiones",
    "presupuesto",
    "recurrentes",
  ]) {
    await page.goto("/auth/revision?screen=" + screen);
    await expect(
      page.getByRole("navigation", { name: "Principal móvil" }),
    ).toBeVisible();
    if (screen === "resumen")
      await expect(page.locator(".recharts-line").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/" + screen + "-mobile.png",
      fullPage: true,
      caret: "initial",
    });
  }
  await page.goto("/auth/revision?screen=perfil");
  await page.getByRole("radio", { name: /Oscuro/ }).check();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/auth/revision");
  await expect(page.locator(".recharts-line").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/resumen-dark.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByText("Más", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Cuentas", exact: true }),
  ).toBeVisible();
});
