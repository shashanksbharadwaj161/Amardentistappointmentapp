import type { MarketplaceDentist } from '@amar-dentist/domain'
import { useEffect,useRef } from 'react'
import MapView,{Callout,Marker} from 'react-native-maps'
import {StyleSheet,Text,View} from 'react-native'
type Coordinates={latitude:number;longitude:number}
type Props={items:MarketplaceDentist[];location:Coordinates|null;onSelect:(item:MarketplaceDentist)=>void}
const dhaka={latitude:23.7808,longitude:90.4077,latitudeDelta:.09,longitudeDelta:.09}
export function NearbyMap({items,location,onSelect}:Props){const map=useRef<MapView>(null);useEffect(()=>{if(location)map.current?.animateToRegion({...location,latitudeDelta:.06,longitudeDelta:.06},600)},[location]);return <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={dhaka} showsUserLocation={Boolean(location)} showsMyLocationButton={false}>
  {items.filter(item=>item.latitude!==null&&item.longitude!==null).map(item=><Marker key={`${item.clinicId}-${item.dentistId}`} coordinate={{latitude:item.latitude!,longitude:item.longitude!}} pinColor={item.openNow?'#176662':'#142A42'}><Callout onPress={()=>onSelect(item)}><View style={styles.callout}><Text style={styles.title}>{item.clinicName}</Text><Text>{item.dentistName}</Text><Text>৳{item.priceBdt.toLocaleString()} · {item.rating.toFixed(1)} ★</Text><Text style={styles.link}>View availability</Text></View></Callout></Marker>)}
</MapView>}
const styles=StyleSheet.create({callout:{width:210,gap:3,padding:4},title:{fontWeight:'800'},link:{marginTop:4,color:'#176662',fontWeight:'700'}})
