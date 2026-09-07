import type { MarketplaceDentist } from '@amar-dentist/domain'
import 'leaflet/dist/leaflet.css'
import './NearbyMap.web.css'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { useEffect } from 'react'

type Coordinates={latitude:number;longitude:number}
type Props={items:MarketplaceDentist[];location:Coordinates|null;onSelect:(item:MarketplaceDentist)=>void}
const dhaka:Coordinates={latitude:23.7808,longitude:90.4077}
function Recenter({location}:{location:Coordinates|null}){const map=useMap();useEffect(()=>{if(location)map.flyTo([location.latitude,location.longitude],13,{duration:.7})},[location,map]);return null}
export function NearbyMap({items,location,onSelect}:Props){const plotted=items.filter((item):item is MarketplaceDentist&{latitude:number;longitude:number}=>item.latitude!==null&&item.longitude!==null);const center=location??(plotted[0]?{latitude:plotted[0].latitude,longitude:plotted[0].longitude}:dhaka)
  return <div style={{height:'100%',width:'100%'}}><MapContainer center={[center.latitude,center.longitude]} zoom={13} scrollWheelZoom style={{height:'100%',width:'100%',background:'#0B1218'}} zoomControl attributionControl>
    <TileLayer
      attribution='&copy; OpenStreetMap contributors'
      className="amar-map-tiles"
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
    <Recenter location={location}/>
    {location?<CircleMarker center={[location.latitude,location.longitude]} radius={7} pathOptions={{color:'#fff',weight:3,fillColor:'#5CB8CF',fillOpacity:1}}><Popup>Your current location</Popup></CircleMarker>:null}
    {plotted.map(item=><CircleMarker key={`${item.clinicId}-${item.dentistId}`} center={[item.latitude,item.longitude]} radius={12} pathOptions={{color:'#0C1C2D',weight:3,fillColor:item.openNow?'#79D2BD':'#FFFFFF',fillOpacity:1}}><Popup><strong>{item.clinicName}</strong><br/>{item.dentistName}<br/>৳{item.priceBdt.toLocaleString()} · {item.rating.toFixed(1)} ★<br/><button type="button" onClick={()=>onSelect(item)}>View availability</button></Popup></CircleMarker>)}
  </MapContainer></div>
}
