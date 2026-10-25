import { test, expect } from "@playwright/test";

for (const mobile of [false, true]) {
  test.describe(mobile ? "Celular" : "Escritorio", () => {
    test.use({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1050 },
      hasTouch: mobile,
      isMobile: mobile,
    });

    test("los seleccionables se cierran al pulsar fuera y conservan sus selecciones", async ({
      page,
    }) => {
      await page.goto("/auth/revision");
      await expect(page.locator(".recharts-line").first()).toBeVisible();
      const accounts = page.locator("details").filter({
        has: page.locator("summary").filter({ hasText: "Cuentas:" }),
      });
      const categories = page.locator("details").filter({
        has: page.locator("summary").filter({ hasText: "Categorías:" }),
      });
      const activate = async (locator: ReturnType<typeof page.locator>) => {
        if (mobile) await locator.tap();
        else await locator.click();
      };
      await activate(accounts.locator("summary"));
      await expect(accounts).toHaveAttribute("open", "");
      const account = accounts.getByRole("checkbox", {
        name: "BCP Débito",
        exact: true,
      });
      await activate(account);
      await expect(account).toBeChecked();
      await expect(accounts).toHaveAttribute("open", "");
      await activate(
        accounts.getByText("Todas elimina la selección de este filtro.", {
          exact: true,
        }),
      );
      await expect(accounts).toHaveAttribute("open", "");
      await activate(
        page.getByRole("heading", { name: "Tu dinero, con claridad" }),
      );
      await expect(accounts).not.toHaveAttribute("open", "");
      await activate(accounts.locator("summary"));
      await expect(account).toBeChecked();
      if (mobile) {
        await activate(
          page.getByRole("heading", { name: "Tu dinero, con claridad" }),
        );
      }
      await activate(categories.locator("summary"));
      await expect(accounts).not.toHaveAttribute("open", "");
      await expect(categories).toHaveAttribute("open", "");
      const food = categories.getByRole("checkbox", {
        name: "Comida",
        exact: true,
      });
      await activate(food);
      await expect(food).toBeChecked();
      if (mobile) {
        await page.screenshot({
          path: "test-results/filtros-celular.png",
          fullPage: true,
        });
        await activate(
          page.getByRole("heading", { name: "Tu dinero, con claridad" }),
        );
        await expect(categories).not.toHaveAttribute("open", "");
      } else {
        await food.press("Escape");
        await expect(categories).not.toHaveAttribute("open", "");
        await expect(categories.locator("summary")).toBeFocused();
        await activate(categories.locator("summary"));
      }
      await activate(
        page.getByRole("button", { name: "Aplicar filtros", exact: true }),
      );
      await expect(page).toHaveURL(
        /cuenta=00000000-0000-4000-8000-000000000010/,
      );
      await expect(page).toHaveURL(
        /categoria=00000000-0000-4000-8000-000000000001/,
      );
      await expect(page.locator("details[open]")).toHaveCount(0);
    });

    test("buscar por texto y tipo actualiza resultados sin recargar ni perder filtros", async ({
      page,
    }) => {
      const accountA = "00000000-0000-4000-8000-000000000010";
      const accountB = "00000000-0000-4000-8000-000000000014";
      await page.goto(
        `/auth/revision?screen=movimientos&periodo=rango&desde=2026-10-01&hasta=2026-10-24&cuenta=${accountA}&cuenta=${accountB}&categoria=00000000-0000-4000-8000-000000000002`,
      );
      // Abrir un modal comprueba que la página ya tiene sus eventos de cliente.
      await page
        .getByRole("button", { name: "Nuevo movimiento", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /Cerrar/ })
        .click();
      await page.evaluate(() => {
        document.documentElement.dataset.searchDocument = "preserved";
      });
      const documentRequests: string[] = [];
      page.on("request", (request) => {
        if (request.resourceType() === "document")
          documentRequests.push(request.url());
      });
      const form = page.getByRole("form", { name: "Buscar movimientos" });
      await form
        .getByRole("textbox", { name: "Buscar", exact: true })
        .fill("Vivienda");
      await form.locator('select[name="tipo"]').selectOption("expense");
      await form.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect(page).toHaveURL(/buscar=Vivienda/);
      await expect(page).toHaveURL(/tipo=expense/);
      await expect(
        page
          .getByRole("list", { name: "Resultados de movimientos" })
          .getByRole("listitem"),
      ).toHaveCount(2);
      const params = new URL(page.url()).searchParams;
      expect(params.getAll("cuenta")).toEqual([accountA, accountB]);
      expect(params.get("categoria")).toBe(
        "00000000-0000-4000-8000-000000000002",
      );
      expect(params.get("desde")).toBe("2026-10-01");
      expect(params.get("hasta")).toBe("2026-10-24");
      await form
        .getByRole("textbox", { name: "Buscar", exact: true })
        .fill("Sueldo");
      await form.locator('select[name="tipo"]').selectOption("income");
      await form
        .getByRole("textbox", { name: "Buscar", exact: true })
        .press("Enter");
      await expect(page).toHaveURL(/buscar=Sueldo/);
      await expect(
        page
          .getByRole("list", { name: "Resultados de movimientos" })
          .getByRole("listitem"),
      ).toHaveText(["Sueldo"]);
      await page.goBack();
      await expect(
        form.getByRole("textbox", { name: "Buscar", exact: true }),
      ).toHaveValue("Vivienda");
      await expect(form.locator('select[name="tipo"]')).toHaveValue("expense");
      await expect(page.locator("html")).toHaveAttribute(
        "data-search-document",
        "preserved",
      );
      expect(documentRequests).toEqual([]);
    });
  });
}
