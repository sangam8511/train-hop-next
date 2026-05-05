export interface Station {
  code: string;
  name: string;
}

export interface TrainClass {
  code: string;
  name: string;
}

export interface Train {
  number: string;
  name: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  availability: {
    [key: string]: string; // class code -> availability status
  };
  fare: {
    [key: string]: number; // class code -> fare
  };
}

export interface Route {
  type: 'direct' | 'alternative';
  trains: Train[];
  totalDuration: string;
  totalFare: number;
  hubStation?: string;
}

export interface SearchParams {
  from: string;
  to: string;
  stops: string[]; // Intermediate stations
  date: Date;
  class: string;
}
