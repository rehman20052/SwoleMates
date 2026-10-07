import { Component, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { reportDiagnostic } from "@/lib/diagnostics";
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { void reportDiagnostic("render", "app", error).catch(() => undefined); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <View style={{ flex:1, padding:28, backgroundColor:"#151515", justifyContent:"center",gap:18 }}><Text style={{color:"white",fontSize:20}}>SwoleMates couldn't open this screen.</Text><Text style={{color:"white"}}>Your saved data is preserved.</Text><Pressable accessibilityRole="button" onPress={() => this.setState({failed:false})}><Text style={{color:"#BDFF00",fontSize:18}}>Try again</Text></Pressable></View>;
  }
}
