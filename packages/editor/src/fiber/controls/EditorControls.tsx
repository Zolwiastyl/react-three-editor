import { CommandBar, KeyboardCommands } from "@editable-jsx/commander"
import { useSettings } from "@editable-jsx/controls"
import { PerformanceControls } from "./PerformanceControls"
import { SceneControls } from "./SceneControls"
import { SelectedElementControls } from "./SelectedElementControls"

export function EditorControls() {
  const { grid, axes } = useSettings("helpers", {
    grid: true,
    axes: true
  })

  return (
    <>
      <SelectedElementControls panel="properties" />
      <SceneControls panel="scene" />
      <CommandBar.In />
      <KeyboardCommands />
      <PerformanceControls panel="settings" order={1} />
      {grid && <gridHelper />}
      {axes && <axesHelper />}
    </>
  )
}
