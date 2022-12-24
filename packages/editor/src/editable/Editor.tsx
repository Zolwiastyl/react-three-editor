import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useId,
  useMemo
} from "react"
import { EditableElement } from "./EditableElement"

import { levaStore, useControls } from "leva"
import {
  Schema,
  SchemaToValues,
  StoreType
} from "leva/dist/declarations/src/types"
import create from "zustand"
import { Panel, usePanel } from "../ui/Panel"
import { createLevaStore } from "./controls/createStore"
import {
  SchemaOrFn,
  usePersistedControls
} from "./controls/usePersistedControls"
import { editable } from "./editable"
import { EditableElementContext } from "./EditableElement"
import { HistoryManager } from "./HistoryManager"

import { createMachine } from "xstate"
import { CommandManager } from "../commandbar"
import { EditPatch, JSXSource, RpcServerFunctions } from "../types"
import { BaseEditableElement } from "./BaseEditableElement"

class PanelManager {
  constructor(public editor: Editor) {}
}

const machine = createMachine({
  id: "editor"
})

type Panel = StoreType & { store: StoreType }

export type EditorStoreStateType = {
  selectedId: null | string
  selectedKey: null | string
  elements: Record<string, EditableElement>
  settingsPanel: string | StoreType
  // send: (event: any) => void
  // state: any
  // service: any
}

import { useSelector } from "@xstate/react"
import {
  ActorRef,
  interpret,
  Interpreter,
  State,
  StateMachine,
  Subscribable
} from "xstate"
import { editorMachine } from "./editor.machine"

export type Store<M> = M extends StateMachine<
  infer Context,
  infer Schema,
  infer Event,
  infer State,
  infer _A,
  infer _B,
  infer _C
>
  ? {
      state: ReturnType<
        Interpreter<Context, Schema, Event, State>["getSnapshot"]
      >
      send: Interpreter<Context, Schema, Event, State>["send"]
      service: Interpreter<Context, Schema, Event, State>
    }
  : never

export type EditorStoreType = ReturnType<typeof createEditorStore>

const createEditorStore = () => {
  return create<EditorStoreStateType>(() => ({
    selectedId: null,
    selectedKey: null,
    elements: {
      // root: new EditableElement("root", {} as any, "editor", null)
    },
    settingsPanel: "default"
  }))
}
// const createEditorStore = () => {}

type Diff = {
  action_type: string
  value: {
    [x: string]: any
  }
  source: any
}

export class Editor<
  T extends EditableElement = EditableElement
> extends EventTarget {
  useSelectedElement() {
    return this.useState(() => this.selectedElement)
  }

  useStates(arg0: string) {
    return this.useState((s) => s.toStrings()[0] === arg0)
  }
  setMode(mode: string): void {
    this.settingsPanel.setValueAtPath(this.modePath, mode, true)
  }
  /**
   * Constructor used to create the editableElement. The default is the EditableElement class
   *
   * Specfic editors can override this to use their own override EditableElement class
   */
  elementConstructor = EditableElement

  /**
   * a store to keep track of all the editor state, eg. settings, mode, selected element, etc.
   */
  store: EditorStoreType
  useStore: EditorStoreType

  /**
   * used to add undo/redo functionality
   */
  history: HistoryManager = new HistoryManager()

  /**
   * Command Manager
   */
  commands: CommandManager = new CommandManager()

  /**
   * a set with all the tree-ids of the expanded elements
   */
  expanded: Set<string>

  /**
   * used by the React API to wrap the React element with whatever we need,
   * should be overriden by superclasses to add more wrappers if necessary.
   *
   * this is applied to each and every editableElement in your tree
   *
   * it is not the only way to add things to the tree. You can also use the
   * `helpers` API from the plugins to add helpers to specific types of
   * elements
   */
  Element = BaseEditableElement

  remount?: () => void
  rootId: string

  service
  send

  machine = editorMachine

  constructor(public plugins: any[], public client: RpcServerFunctions) {
    super()
    this.store = createEditorStore()
    this.useStore = this.store

    let prevState = localStorage.getItem("r3f-editor.machine")
    if (prevState) {
      prevState = JSON.parse(prevState)
    }

    console.log("prevState", prevState)

    const service = interpret(editorMachine, {
      execute: false // do not execute actions on state transitions
    })

    service.onTransition((state) => {
      // execute actions on next animation frame
      // instead of immediately

      console.log("state", state)
      service.execute(state, {
        selectElement: (context, event) => {
          // console.log(context, event)
          // context.selectedId = event.element
        }
      })

      localStorage.setItem("r3f-editor.machine", JSON.stringify(state))
    })

    service.start(prevState ? State.create(prevState) : undefined)

    this.service = service
    this.send = service.send.bind(service)
    this.rootId = ""
    // this.store = create<EditorStoreStateType>((set, get) => {
    //   // const stateDefinition =
    //   //   JSON.parse(localStorage.getItem("r3f-editor.machine")) ||
    //   //   editorMachine.initialState

    //   let service = interpret(
    //     editorMachine.withContext({
    //       editor: el,
    //       selectedElement: null
    //     })
    //   )
    //     .onTransition((state) => {
    //       const initialStateChanged =
    //         state.changed === undefined && Object.keys(state.children).length

    //       if (state.changed || initialStateChanged) {
    //         set({ state })
    //       }

    //       state.context.editor = undefined
    //       state.context.event = undefined
    //       localStorage.setItem(
    //         "r3f-editor.machine",
    //         JSON.stringify(state.context)
    //       )
    //       state.context.editor = el
    //     })
    //     .start()

    //   // service.send({ type: "SET_EDITOR", editor: this })

    //   return {
    //     selectedId: null,
    //     selectedKey: null,
    //     elements: {
    //       root: new EditableElement("root", {} as any, "editor", null)
    //     },
    //     state: service.getSnapshot(),
    //     send: service.send,
    //     service,
    //     settingsPanel: "default"
    //   }
    // })()
    this.expanded = localStorage.getItem("collapased")
      ? new Set(JSON.parse(localStorage.getItem("collapased")!))
      : new Set()

    this.client.initializeComponentsWatcher()
  }

  useState<
    TActor extends ActorRef<any, any>,
    T,
    TEmitted = TActor extends Subscribable<infer Emitted> ? Emitted : never
  >(selector: (emitted: TEmitted) => T): T {
    return useSelector(this.service, selector)
  }

  get state() {
    return this.service.getSnapshot()
  }

  setRef(element: any, ref: any) {}

  async saveDiff(diff: EditPatch) {
    await this.client.save(diff)
  }

  async save(diffs: EditPatch[]) {
    for (let diff of diffs) {
      await this.saveDiff(diff)
    }
  }

  /**
   * ELEMENT TREE
   */

  createElement(
    id: string,
    source: JSXSource,
    componentType: string | import("react").FC<{}>,
    props: any
  ): T {
    let element = new this.elementConstructor(
      id,
      source,
      componentType,
      null,
      props
    )

    element.editor = this
    return element as any as T
  }

  appendNewElement(element: EditableElement, componentType: string) {
    if (typeof componentType === "string") {
      element.refs.setMoreChildren?.((children) => [
        ...children,
        createElement(editable[componentType], {
          _source: {
            ...element.source,
            lineNumber: -1,
            elementName: componentType
          },
          key: children.length
        })
      ])
    }
  }

  deleteElement(element: EditableElement) {
    element.delete()
    this.clearSelection()
    // await this.client.save({
    //   ...params,
    //   action_type: "deleteElement"
    // })
  }

  appendElement(element: EditableElement, parentId: string | null) {
    console.log("appendElement", element.key, element.id, parentId)
    if (parentId) {
      element.parentId = parentId
      this?.store?.setState((el) => {
        let parent = Object.assign(el.elements[parentId] ?? {}, {
          childIds: [...(el.elements[parentId]?.childIds ?? []), element.id]
        })

        let newLement = Object.assign(element, el.elements[element.id])
        newLement.index = `${parent.childIds.length - 1}`
        return {
          elements: {
            ...el.elements,
            [newLement.id]: newLement,
            [parentId]: parent
          }
        }
      })
    } else {
      this?.store?.setState((el) => ({
        elements: {
          ...el.elements,
          [element.id]: Object.assign(element, el.elements[element.id])
        }
      }))
    }
  }

  removeElement(element: EditableElement, parentId: string | null) {
    if (parentId) {
      element.parentId = null
      this?.store?.setState((el) => {
        let e = {
          ...el.elements
        }

        if (e[parentId]) {
          e[parentId].childIds = e[parentId]?.childIds.filter(
            (c: string) => c !== element.id
          )
        }

        delete e[element.id]
        return { elements: e }
      })
    } else {
      this?.store?.setState((el) => {
        let e = { ...el }
        delete e.elements[element.id]
        return e
      })
    }
  }

  /**
   *
   * @param Component The component type that we are going to render, it used to detect the name of the component, and can be switched later
   * @param props The props that we are going to pass to the component
   * @param forwardRef true or ref if we want to forward the ref to the component or undefined
   * @returns
   */
  useElement(Component: any, props: any, forwardRef?: any): [T, any] {
    const id = props.id || useId()

    const editableElement = useMemo(() => {
      return this.createElement(id, props._source, Component, props)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [Component, id])

    // attaches the render, remount functions and returns a key that
    // need to be passed to the React element to cause remounts
    const { key, ref, moreChildren } =
      editableElement.useRenderState(forwardRef)

    // update the element with the latest props and source
    editableElement.update(props._source, props)

    // see if we have a parent element
    const parentId = useContext(EditableElementContext)?.id!

    console.log(Component, id, parentId)

    useEffect(() => {
      if (!editableElement.deleted) {
        this.appendElement(editableElement, parentId)
        this.send("APPEND_ELEMENT", { elementId: editableElement.id, parentId })
      }
      return () => {
        this.removeElement(editableElement, parentId)
        this.send("REMOVE_ELEMENT", { elementId: editableElement.id, parentId })
      }
    }, [parentId, editableElement, editableElement.deleted])

    return [
      editableElement,
      {
        ...props,
        ...editableElement.props,
        key,
        ref: forwardRef ? ref : undefined,
        children: props.children
      }
    ]
  }

  get root() {
    return this.store.getState().elements[this.rootId]
  }

  getElementById(id: string): EditableElement {
    return this.store.getState().elements[id]
  }

  findEditableElement(el: any): T | null {
    throw new Error("Method not implemented.")
  }

  /**
   * SELECTION
   */

  get selectedElement() {
    if (this.state.context.selectedId) {
      return this.getElementById(this.state.context.selectedId!)
    }

    return null
  }

  select(element: EditableElement<any>): void {
    this.send("SELECT", { elementId: element.id })
  }

  clearSelection(): void {
    this.send("CLEAR_SELECTION")
  }

  isSelected(arg0: EditableElement) {
    return this.state.context.selectedId === arg0.id
  }

  /**
   * PANELS
   **/

  panelStore = create((get, set) => ({
    panels: {
      default: {
        panel: levaStore as Panel
      }
    } as Record<string, { panel: Panel }>
  }))

  get panels() {
    return this.panelStore.getState().panels
  }

  getPanel(name: string | StoreType): Panel {
    let panels = this.panels
    if (typeof name === "string") {
      if (panels[name]) return panels[name].panel

      panels[name] = { panel: createLevaStore() }

      // @ts-ignore
      panels[name].panel.store = panels[name].panel

      this.panelStore.setState(() => ({
        panels
      }))
      return panels[name].panel
    } else {
      return name as Panel
    }
  }

  showAllPanels() {
    this.settingsPanel.useStore.setState(({ data }: any) => {
      let panelNames = Object.keys(this.panels)
      for (let i = 0; i < panelNames.length; i++) {
        data[this.settingsPath("panels." + panelNames[i] + ".hidden")].value =
          false
      }

      return { data }
    })
  }

  /**
   *  SETTINGS
   * */

  settings = createLevaStore()

  get settingsPanel(): Panel {
    return this.getPanel(this.store.getState().settingsPanel)
  }

  set settingsPanel(arg0: StoreType | string) {
    this.store.setState({
      settingsPanel: arg0
    })
  }

  getSettings(arg0: string): number[] | ArrayLike<number> {
    return this.settingsPanel.getData()[this.settingsPath(arg0)].value as any
  }

  setSetting(arg0: string, arg1: any) {
    let path = this.settingsPath(arg0)
    if (this.settingsPanel.getData()[path]) {
      this.settingsPanel.setValueAtPath(path, arg1, true)
    }
  }

  setSettings(values: any) {
    this.settingsPanel.useStore.setState(({ data }) => {
      for (let key in values) {
        data[this.settingsPath(key)].value = values[key]
      }
      return { data }
    })
  }

  useMode<K extends string | undefined>(name?: K) {
    return this.useState(() => this.state.toStrings()[0])
  }

  modePath = "somethingelse.mode"

  settingsPath(arg0?: string | undefined): any {
    return (
      `world.` +
      `${this.state.toStrings()[0]} settings` +
      (arg0 ? "." + arg0 : "")
    )
  }

  get mode() {
    return this.state.toStrings()[0]
  }

  useSettingsPanel() {
    return usePanel(this.store((s) => s.settingsPanel))
  }

  useSettings<S extends Schema, T extends SchemaOrFn<S>>(
    name: string,
    arg1: T,
    hidden?: boolean
  ): [SchemaToValues<T>] {
    const settingsPanel = this.useSettingsPanel()
    const mode = this.useMode()
    useControls(
      this.settingsPath(),
      {},
      { order: 1001, render: () => this.selectedElement === null },
      {
        store: settingsPanel.store
      },
      [mode]
    )

    let props = usePersistedControls(
      this.settingsPath(name),
      arg1,
      [mode],
      settingsPanel.store,
      hidden
    )

    return props as any
  }

  // // Keep track of the current state, and start
  // // with the initial state
  // currentState = editorMachine.initialState

  // // Keep track of the listeners
  // listeners = new Set<(state: typeof editorMachine.initialState) => void>()

  // // Have a way of sending/dispatching events
  // send(
  //   arg0: Parameters<typeof editorMachine.transition>[1],
  //   arg1?: Parameters<typeof editorMachine.transition>[2]
  // ) {
  //   // Remember: machine.transition() is a pure function
  //   this.currentState = editorMachine.transition(this.currentState, arg0, arg1)

  //   // Get the side-effect actions to execute
  //   const { actions } = this.currentState

  //   actions.forEach((action) => {
  //     // If the action is executable, execute it
  //     console.log(action)
  //     typeof action.exec === "function" && action.exec()
  //   })

  //   // Notify the listeners
  //   this.listeners.forEach((listener) => listener(this.currentState))
  // }

  // listen(listener) {
  //   this.listeners.add(listener)
  // }

  // unlisten(listener) {
  //   this.listeners.delete(listener)
  // }

  /**
   * PLUGINS
   */

  addPlugin(plugin: {
    applicable: (arg0: any) => boolean
    debug?: (arg0: any, arg1: any, arg2?: any) => () => void
  }) {
    this.plugins.push(plugin)
  }
}

export const EditorContext = createContext<Editor | null>(null)
