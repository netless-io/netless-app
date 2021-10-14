export enum IframeEvents {
  Init = "Init",
  AttributesUpdate = "AttributesUpdate",
  SetAttributes = "SetAttributes",
  RegisterMagixEvent = "RegisterMagixEvent",
  RemoveMagixEvent = "RemoveMagixEvent",
  RemoveAllMagixEvent = "RemoveAllMagixEvent",
  RoomStateChanged = "RoomStateChanged",
  DispatchMagixEvent = "DispatchMagixEvent",
  ReceiveMagixEvent = "ReciveMagixEvent", // the typo is intentional to stay the same
  NextPage = "NextPage",
  PrevPage = "PrevPage",
  SDKCreate = "SDKCreate",
  OnCreate = "OnCreate",
  SetPage = "SetPage",
  GetAttributes = "GetAttributes",
  Ready = "Ready",
  Destroy = "Destory", // the typo is intentional to stay the same
  StartCreate = "StartCreate",
  WrapperDidUpdate = "WrapperDidUpdate",
  DisplayIframe = "DisplayIframe",
  HideIframe = "HideIframe", // will never emit
  PageTo = "PageTo",
}

export enum DomEvents {
  WrapperDidMount = "WrapperDidMount",
  IframeLoad = "IframeLoad",
}
