declare namespace google.maps {
  class StreetViewPanorama {
    constructor(container: HTMLElement, opts?: StreetViewPanoramaOptions);
    getPosition(): LatLng | null;
    getPov(): StreetViewPov;
    setPosition(latLng: LatLng | LatLngLiteral): void;
    addListener(eventName: string, handler: () => void): MapsEventListener;
  }

  class StreetViewService {
    getPanorama(
      request: StreetViewLocationRequest,
      callback: (data: StreetViewPanoramaData | null, status: StreetViewStatus) => void
    ): void;
  }

  interface StreetViewPanoramaOptions {
    position?: LatLng | LatLngLiteral;
    pov?: StreetViewPov;
    zoom?: number;
    addressControl?: boolean;
    showRoadLabels?: boolean;
    motionTracking?: boolean;
    motionTrackingControl?: boolean;
  }

  interface StreetViewPov {
    heading: number;
    pitch: number;
  }

  interface StreetViewLocationRequest {
    location: LatLng | LatLngLiteral;
    radius?: number;
  }

  interface StreetViewPanoramaData {
    location?: {
      latLng?: LatLng;
      pano?: string;
    };
  }

  enum StreetViewStatus {
    OK = "OK",
    UNKNOWN_ERROR = "UNKNOWN_ERROR",
    ZERO_RESULTS = "ZERO_RESULTS",
  }

  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  interface LatLngLiteral {
    lat: number;
    lng: number;
  }

  interface MapsEventListener {
    remove(): void;
  }

  namespace event {
    function clearInstanceListeners(instance: object): void;
  }
}

declare interface Window {
  google: typeof google;
}
