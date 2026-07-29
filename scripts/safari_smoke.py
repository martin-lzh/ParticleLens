from __future__ import annotations

import tempfile
from pathlib import Path

import cv2
import numpy as np
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as conditions
from selenium.webdriver.support.ui import Select, WebDriverWait


def make_image(path: Path) -> None:
    image = np.full((600, 800, 3), 232, dtype=np.uint8)
    for center, radius in [((150, 150), 30), ((350, 220), 48), ((590, 310), 40)]:
        cv2.circle(image, center, radius, (100, 100, 100), -1, lineType=cv2.LINE_AA)
    cv2.rectangle(image, (700, 548), (779, 552), (0, 0, 0), -1)
    if not cv2.imwrite(str(path), image):
        raise RuntimeError("Could not write Safari smoke-test image.")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="particlelens-safari-") as directory:
        image_path = Path(directory) / "synthetic.png"
        make_image(image_path)

        driver = webdriver.Safari()
        wait = WebDriverWait(driver, 180)
        try:
            driver.get("http://127.0.0.1:4174/")
            wait.until(
                lambda browser: "hidden"
                in browser.find_element(By.ID, "runtimeLoader").get_attribute("class").split()
            )
            wait.until(conditions.element_to_be_clickable((By.ID, "runDetect")))

            driver.find_element(By.ID, "imageInput").send_keys(str(image_path))
            Select(driver.find_element(By.ID, "contrastMode")).select_by_value("none")
            driver.execute_script(
                """
                for (const [id, value] of [
                  ["sensitivity", "0.7"],
                  ["minDiameter", "15"],
                  ["maxDiameter", "80"],
                ]) {
                  const input = document.getElementById(id);
                  input.value = value;
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                }
                """
            )
            driver.find_element(By.ID, "runDetect").click()
            wait.until(lambda browser: len(browser.find_elements(By.CSS_SELECTOR, "#particleTable tr")) == 3)

            driver.execute_script(
                """
                window.__particleLensDownloads = 0;
                const original = HTMLAnchorElement.prototype.click;
                HTMLAnchorElement.prototype.click = function () {
                  if (this.download) window.__particleLensDownloads += 1;
                  return original.call(this);
                };
                """
            )
            driver.find_element(By.CSS_SELECTOR, "[data-left-tab='export']").click()
            driver.find_element(By.ID, "exportCsv").click()
            driver.find_element(By.ID, "exportPng").click()
            wait.until(
                lambda browser: browser.execute_script("return window.__particleLensDownloads") == 2
            )
            print("Safari initialization, detection, and export smoke test passed.")
        finally:
            driver.quit()


if __name__ == "__main__":
    main()
