export class TechnoSynth {
  ctx: AudioContext;
  masterGain: GainNode;
  delayNode: DelayNode;
  delayGain: GainNode;
  
  isPlaying: boolean = false;
  tempo: number = 130;
  style: 'minimal' | 'hard' = 'minimal';
  
  scheduleAheadTime: number = 0.1;
  nextNoteTime: number = 0;
  current16thNote: number = 0; // 0-63 for 4 bars
  timerID: number | undefined;
  lookahead: number = 25.0;
  
  bassPattern: number[] = [];
  
  constructor(ctx: AudioContext, style: 'minimal' | 'hard' = 'minimal') {
    this.ctx = ctx;
    this.style = style;
    
    // Signal Chain:
    // Nodes -> MasterGain -> Destination
    //       -> Delay -> DelayGain -> MasterGain
    
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.5;

    // Spatial FX (Dub Delay)
    this.delayNode = ctx.createDelay();
    this.delayNode.delayTime.value = 0.375; // Dotted 8th note approx at 120
    
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.0; // Default off
    
    const feedback = ctx.createGain();
    feedback.gain.value = 0.4;
    
    const delayFilter = ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 1000;

    // Connect Delay Loop
    this.delayNode.connect(feedback);
    feedback.connect(delayFilter);
    delayFilter.connect(this.delayNode);
    
    // Connect Delay to Master
    this.delayNode.connect(this.delayGain);
    this.delayGain.connect(this.masterGain);

    this.regenerate(style);
  }

  connect(dest: AudioNode) {
    this.masterGain.connect(dest);
  }

  regenerate(style?: 'minimal' | 'hard') {
    if (style) this.style = style;
    
    // Set Tempo and FX based on style
    if (this.style === 'hard') {
        this.tempo = 140 + Math.floor(Math.random() * 5);
        this.delayGain.gain.value = 0.4; // Enable Echo
        this.delayNode.delayTime.value = (60 / this.tempo) * 0.75; // Sync delay
        this.generateHardPattern();
    } else {
        this.tempo = 126 + Math.floor(Math.random() * 4);
        this.delayGain.gain.value = 0.1; // Subtle Echo
        this.delayNode.delayTime.value = (60 / this.tempo) * 0.5;
        this.generateMinimalPattern();
    }
  }

  generateMinimalPattern() {
    // 1 Bar Loop (16 steps)
    const baseFreq = 55; 
    const intervals = [1, 1.5];
    this.bassPattern = Array(64).fill(0).map((_, i) => {
        const stepInBar = i % 16;
        // Minimal is sparse, syncopated
        const probability = (stepInBar % 4 === 2) ? 0.6 : 0.2;
        if (Math.random() < probability) {
            return baseFreq * intervals[Math.floor(Math.random() * intervals.length)];
        }
        return 0;
    });
  }

  generateHardPattern() {
    // 4 Bar Loop (64 steps) - Rolling Bassline
    // Rumble kick handles the "1", bass fills the offbeats
    const root = 45; // Low F
    this.bassPattern = Array(64).fill(0).map((_, i) => {
        const stepInBar = i % 16;
        
        // Rolling bass on off-16ths: x B B B x B B B
        if (stepInBar % 4 !== 0) {
             // 80% chance of rolling bass note
             if (Math.random() < 0.8) return root;
        }
        // Occasional octave jump at end of bar
        if (stepInBar > 12 && Math.random() < 0.3) return root * 2;
        
        return 0;
    });
  }

  nextNote() {
    const secondsPerBeat = 60.0 / this.tempo;
    this.nextNoteTime += 0.25 * secondsPerBeat;
    this.current16thNote++;
    if (this.current16thNote === 64) {
        this.current16thNote = 0;
    }
  }

  scheduleNote(stepIndex: number, time: number) {
    const stepInBar = stepIndex % 16;
    
    // 1. KICK (4/4)
    if (stepInBar % 4 === 0) {
        if (this.style === 'hard') {
            this.playRumbleKick(time);
        } else {
            this.playKick(time);
        }
    }

    // 2. HATS
    if (this.style === 'hard') {
        // Open Hat on offbeats (standard techno)
        if (stepInBar % 4 === 2) this.playHiHat(time, true);
        // Closed Hat rolling 16ths
        if (stepInBar % 2 !== 0) this.playHiHat(time, false);
        // Ride cymbal on every beat
        if (stepInBar % 4 === 0 && Math.random() > 0.5) this.playHiHat(time, true, 0.1);
    } else {
        // Funky/Minimal hats
        if (stepInBar % 4 === 2) this.playHiHat(time, true);
        else if (Math.random() > 0.7) this.playHiHat(time, false);
    }

    // 3. BASS
    const bassFreq = this.bassPattern[stepIndex];
    if (bassFreq > 0) {
        this.playBass(time, bassFreq);
    }
    
    // 4. PERC / FX
    if (this.style === 'hard') {
        // Industrial metallic clank
        if (Math.random() > 0.97) this.playIndustrialPerc(time);
    } else {
        // Glitch click
        if (Math.random() > 0.95) this.playClick(time);
    }
  }

  scheduler() {
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
        this.scheduleNote(this.current16thNote, this.nextNoteTime);
        this.nextNote();
    }
    if (this.isPlaying) {
        this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
    }
  }

  play() {
    if (this.isPlaying) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.isPlaying = true;
    this.current16thNote = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.scheduler();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerID) window.clearTimeout(this.timerID);
  }

  // --- Instruments ---

  playKick(time: number) {
     const osc = this.ctx.createOscillator();
     const gain = this.ctx.createGain();
     osc.connect(gain);
     gain.connect(this.masterGain);

     osc.frequency.setValueAtTime(150, time);
     osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
     
     gain.gain.setValueAtTime(1, time);
     gain.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

     osc.start(time);
     osc.stop(time + 0.5);
  }

  playRumbleKick(time: number) {
     // 1. Transient Click/Punch
     const osc = this.ctx.createOscillator();
     const gain = this.ctx.createGain();
     osc.connect(gain);
     gain.connect(this.masterGain);

     osc.frequency.setValueAtTime(120, time);
     osc.frequency.exponentialRampToValueAtTime(40, time + 0.3);
     
     // Hard distortion curve for kick
     gain.gain.setValueAtTime(1.0, time);
     gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

     osc.start(time);
     osc.stop(time + 0.3);

     // 2. The Rumble (Reverb Tail simulation using filtered noise)
     const bufferSize = this.ctx.sampleRate * 0.5;
     const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
     const data = buffer.getChannelData(0);
     for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
     
     const noise = this.ctx.createBufferSource();
     noise.buffer = buffer;

     const rumbleFilter = this.ctx.createBiquadFilter();
     rumbleFilter.type = 'lowpass';
     rumbleFilter.frequency.value = 80; // Sub rumble only
     
     const rumbleGain = this.ctx.createGain();
     // Delayed start for rumble (after kick transient)
     rumbleGain.gain.setValueAtTime(0, time);
     rumbleGain.gain.linearRampToValueAtTime(0.6, time + 0.05);
     rumbleGain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
     
     noise.connect(rumbleFilter);
     rumbleFilter.connect(rumbleGain);
     rumbleGain.connect(this.masterGain);
     
     noise.start(time);
  }

  playHiHat(time: number, open: boolean, vol: number = 0) {
     const bufferSize = this.ctx.sampleRate * (open ? 0.1 : 0.05);
     const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
     const data = buffer.getChannelData(0);
     for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

     const noise = this.ctx.createBufferSource();
     noise.buffer = buffer;
     
     const filter = this.ctx.createBiquadFilter();
     filter.type = 'highpass';
     filter.frequency.value = this.style === 'hard' ? 8000 : 7000; // Sharper hats for hard

     const gain = this.ctx.createGain();
     const volume = vol > 0 ? vol : (open ? 0.3 : 0.1);
     gain.gain.setValueAtTime(volume, time);
     gain.gain.exponentialRampToValueAtTime(0.01, time + (open ? 0.1 : 0.05));

     noise.connect(filter);
     filter.connect(gain);
     // Send some hats to delay for spatial width
     if (open) gain.connect(this.delayNode);
     gain.connect(this.masterGain);
     
     noise.start(time);
  }

  playBass(time: number, freq: number) {
      const osc = this.ctx.createOscillator();
      osc.type = this.style === 'hard' ? 'sawtooth' : 'square'; 
      osc.frequency.setValueAtTime(freq, time);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = this.style === 'hard' ? 8 : 5; // More resonance for acid feel

      const gain = this.ctx.createGain();
      
      filter.frequency.setValueAtTime(100, time);
      filter.frequency.exponentialRampToValueAtTime(this.style === 'hard' ? 2000 : 1500, time + 0.02);
      filter.frequency.exponentialRampToValueAtTime(100, time + 0.2);

      gain.gain.setValueAtTime(0.4, time);
      gain.gain.linearRampToValueAtTime(0, time + 0.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(time);
      osc.stop(time + 0.25);
  }
  
  playClick(time: number) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 2000;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.05);
  }

  playIndustrialPerc(time: number) {
     const osc = this.ctx.createOscillator();
     osc.type = 'triangle';
     osc.frequency.setValueAtTime(300, time);
     osc.frequency.exponentialRampToValueAtTime(100, time + 0.2);
     
     // FM Modulation
     const mod = this.ctx.createOscillator();
     mod.frequency.value = 800;
     const modGain = this.ctx.createGain();
     modGain.gain.value = 500;
     mod.connect(modGain);
     modGain.connect(osc.frequency);
     
     const gain = this.ctx.createGain();
     gain.gain.setValueAtTime(0.2, time);
     gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
     
     osc.connect(gain);
     // Heavy reverb send
     gain.connect(this.delayNode);
     gain.connect(this.masterGain);
     
     osc.start(time);
     mod.start(time);
     osc.stop(time + 0.2);
     mod.stop(time + 0.2);
  }
}