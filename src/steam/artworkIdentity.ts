import { metadataState, type Unpatch } from "./core";
import { withInCallTruth } from "./inCallTruth";
import { steamUiDocuments, type SteamUiDocument } from "./steamUiHost";
import { findSteamModulesBySource } from "./steamUiModules";

type TruthState = { bypassCounter: number };
type ArtworkInstance = {
  props: Record<string, any>;
  GetSourcesForAsset: () => unknown;
  forceUpdate?: () => void;
};
type ArtworkClass = {
  new (...args: any[]): ArtworkInstance;
  prototype: any;
};
type Binding = {
  instance: ArtworkInstance;
  original: () => unknown;
  guarded: () => unknown;
  originalMethod?: PropertyDescriptor;
  restoreProps?: () => void;
};

const METHOD = "GetSourcesForAsset";

const propertyDescriptor = (target: object, name: string): PropertyDescriptor | undefined => {
  for (let current = target; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return descriptor;
  }
  return undefined;
};

/** Guard the native resolver without changing its candidates or the app overview. */
export const guardNativeArtworkIdentity = (
  component: ArtworkClass,
  state: TruthState,
  mounted: Iterable<ArtworkInstance> = [],
): Unpatch => {
  const prototype = component.prototype;
  const originalGetter = Object.getOwnPropertyDescriptor(prototype, METHOD);
  if (!originalGetter?.configurable || typeof originalGetter.get !== "function") {
    throw new Error("Native artwork source getter is unavailable");
  }
  if (typeof WeakRef !== "function" || typeof FinalizationRegistry !== "function") {
    throw new Error("Native artwork lifetime primitives are unavailable");
  }
  let active = true;
  const bindings = new WeakMap<ArtworkInstance, Binding>();
  const live = new Set<WeakRef<Binding>>();
  const finalizer = new FinalizationRegistry<WeakRef<Binding>>((reference) => { live.delete(reference); });

  const retain = (binding: Binding) => {
    bindings.set(binding.instance, binding);
    const reference = new WeakRef(binding);
    live.add(reference);
    finalizer.register(binding.instance, reference, binding.instance);
    return binding;
  };

  const guardBoundInstance = (instance: ArtworkInstance): Binding => {
    const retained = bindings.get(instance);
    if (retained) return retained;
    const method = Object.getOwnPropertyDescriptor(instance, METHOD);
    if (typeof method?.value !== "function") throw new Error("Native artwork binding is unavailable");
    // Locked native methods are already bound; a configurable peer override
    // still needs its original instance receiver.
    const original = method.configurable ? method.value.bind(instance) : method.value;
    const guarded = () => active ? withInCallTruth(state, original) : original();
    const binding: Binding = { instance, original, guarded, originalMethod: method };
    if (method.configurable) {
      Object.defineProperty(instance, METHOD, { ...method, value: guarded });
      return retain(binding);
    }

    // Steam memoizes this resolver as a non-configurable bound method. Supply
    // its real result through rgSources instead; the native render already
    // gives that input precedence. Keep refs, focus and the owner mounted.
    const ownProps = Object.getOwnPropertyDescriptor(instance, "props");
    const nativeProps = propertyDescriptor(instance, "props");
    if (ownProps && !ownProps.configurable) throw new Error("Mounted artwork props cannot be guarded");
    if (!nativeProps || ("value" in nativeProps && !nativeProps.writable) ||
      (!("value" in nativeProps) && (!nativeProps.get || !nativeProps.set))) {
      throw new Error("Mounted artwork props contract is unavailable");
    }
    let rawProps = instance.props;
    let cachedRaw: Record<string, any> | undefined;
    let cachedView: Record<string, any> | undefined;
    let nativeAccess = 0;
    const readRaw = () => nativeProps.get ? nativeProps.get.call(instance) : rawProps;
    const resolveSources = () => {
      const props = readRaw();
      if (props.rgSources) return props.rgSources;
      nativeAccess += 1;
      try { return guarded(); }
      finally { nativeAccess -= 1; }
    };
    const getProps = () => {
      const props = readRaw();
      if (!active || nativeAccess > 0 || props.rgSources) return props;
      if (cachedRaw !== props) {
        cachedRaw = props;
        cachedView = { ...props };
        // This computed input is not an extra native prop for shallow-equality
        // or rest-prop forwarding. The original fields remain unchanged.
        Object.defineProperty(cachedView, "rgSources", {
          configurable: true,
          enumerable: false,
          get: resolveSources,
        });
      }
      return cachedView;
    };
    const setProps = (next: Record<string, any>) => {
      nativeAccess += 1;
      try {
        if (nativeProps.set) nativeProps.set.call(instance, next);
        else rawProps = next;
      } finally { nativeAccess -= 1; }
    };
    Object.defineProperty(instance, "props", {
      configurable: true,
      enumerable: ownProps?.enumerable ?? nativeProps.enumerable ?? true,
      get: getProps,
      set: setProps,
    });
    binding.restoreProps = () => {
      if (Object.getOwnPropertyDescriptor(instance, "props")?.get !== getProps) return;
      if (!ownProps) delete instance.props;
      else Object.defineProperty(instance, "props", "value" in ownProps
        ? { ...ownProps, value: rawProps }
        : ownProps);
      cachedRaw = undefined;
      cachedView = undefined;
    };
    return retain(binding);
  };

  const getSources = function(this: ArtworkInstance) {
    if (!active || this === prototype) return originalGetter.get.call(this);
    const owned = Object.getOwnPropertyDescriptor(this, METHOD);
    if (owned) return guardBoundInstance(this).guarded;
    let original: () => unknown;
    const guarded = () => active ? withInCallTruth(state, original) : original();
    // Defining the owned wrapper first prevents the native autobind accessor
    // from locking its unguarded function onto this new instance.
    Object.defineProperty(this, METHOD, { configurable: true, writable: true, value: guarded });
    try { original = originalGetter.get.call(this); }
    catch (error) { delete this.GetSourcesForAsset; throw error; }
    retain({ instance: this, original, guarded });
    return guarded;
  };

  const cleanup = () => {
    if (!active) return;
    active = false;
    if (Object.getOwnPropertyDescriptor(prototype, METHOD)?.get === getSources) {
      Object.defineProperty(prototype, METHOD, originalGetter);
    }
    for (const reference of live) {
      const binding = reference.deref();
      if (!binding) continue;
      finalizer.unregister(binding.instance);
      binding.restoreProps?.();
      if (Object.getOwnPropertyDescriptor(binding.instance, METHOD)?.value === binding.guarded) {
        Object.defineProperty(binding.instance, METHOD, binding.originalMethod ?? {
          configurable: false, enumerable: false, writable: false, value: binding.original,
        });
      }
      bindings.delete(binding.instance);
    }
    live.clear();
  };

  Object.defineProperty(prototype, METHOD, { ...originalGetter, get: getSources });
  try {
    for (const instance of mounted) {
      const owned = Object.getOwnPropertyDescriptor(instance, METHOD);
      if (typeof owned?.value !== "function") continue;
      guardBoundInstance(instance);
      instance.forceUpdate?.();
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
};

const isArtworkClass = (candidate: unknown): candidate is ArtworkClass => {
  if (typeof candidate !== "function") return false;
  const prototype = candidate.prototype;
  if (!prototype || typeof prototype !== "object" || !("isReactComponent" in prototype)) return false;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, METHOD);
  return descriptor?.configurable === true && typeof descriptor.get === "function";
};

const resolveArtworkClass = (): ArtworkClass | undefined => {
  const classes = new Set<ArtworkClass>();
  for (const module of findSteamModulesBySource(["LibraryAssetImage_UnknownName", METHOD])) {
    if (!module || typeof module !== "object") continue;
    for (const candidate of Object.values(module)) {
      if (isArtworkClass(candidate)) classes.add(candidate);
    }
  }
  return classes.size === 1 ? classes.values().next().value : undefined;
};

const mountedArtwork = (component: ArtworkClass, documents: SteamUiDocument[]): ArtworkInstance[] => {
  const instances = new Set<ArtworkInstance>();
  for (const document of documents) {
    for (const image of Array.from(document.querySelectorAll("img"))) {
      const key = Object.keys(image).find((name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
      const value = key && key in image ? image[key] : undefined;
      let fiber = value && typeof value === "object" ? value : undefined;
      for (let depth = 0; fiber && depth < 24; depth += 1) {
        const instance = "stateNode" in fiber ? fiber.stateNode : undefined;
        if (instance instanceof component) instances.add(instance);
        const parent = "return" in fiber ? fiber.return : undefined;
        fiber = parent && typeof parent === "object" ? parent : undefined;
      }
    }
  }
  return Array.from(instances);
};

/** Install before the overview spoof, so teardown removes that spoof first. */
export const installNativeArtworkIdentity = (unpatchers: Unpatch[]): void => {
  const component = resolveArtworkClass();
  if (!component) throw new Error("Native artwork component was not found");
  unpatchers.push(guardNativeArtworkIdentity(component, metadataState, mountedArtwork(component, steamUiDocuments())));
};
